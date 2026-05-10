/**
 * Webhooks - Etherfuse + Helius
 */
import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import canonicalize from "canonicalize";
import pool from "../db/pool.js";
import { enviarMensaje } from "../services/notificaciones.js";
import { notifyWithLidia } from "../services/lidiaAgent.js";

const router = Router();
const WEBHOOK_SECRET  = process.env.ETHERFUSE_WEBHOOK_SECRET || "";
const HELIUS_AUTH_KEY = process.env.HELIUS_WEBHOOK_AUTH || ""; // opcional — para validar origen
const PROGRAM_ID      = process.env.PROGRAM_ID || "B1G72CcRGHYc1UpG4o51VrJySLiwm3d7tCHbQiSb5vZ2";

// ── Webhook Helius — detecta transacciones del programa Anchor ────────────────
// Helius llama este endpoint cada vez que hay una tx de nuestro Program ID
router.post("/helius", async (req, res) => {
  // Validar auth header si está configurado
  if (HELIUS_AUTH_KEY) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${HELIUS_AUTH_KEY}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      // Solo procesar transacciones exitosas
      if (event.transactionError) {
        console.log("[Helius] Tx con error, ignorando:", event.signature);
        continue;
      }

      const signature = event.signature;
      const accounts  = event.accountData ?? event.accounts ?? [];

      console.log(`[Helius] Nueva tx detectada: ${signature}`);

      // Buscar si esta tx corresponde a una suscripción activa en nuestra DB
      // Buscamos la wallet del destinatario en las cuentas de la transacción
      for (const account of accounts) {
        const walletSolana = account.account ?? account.pubkey;
        if (!walletSolana) continue;

        // Buscar suscripción activa para esta wallet
        const result = await pool.query(
          `SELECT s.*, b.telefono_wa as user_wa, b.zona as zone
           FROM suscripciones s
           LEFT JOIN beneficiarios_etherfuse b ON b.destinatario_solana = s.destinatario_solana
           WHERE s.destinatario_solana = $1 AND s.activa = true
           LIMIT 1`,
          [walletSolana]
        );

        if (result.rows.length === 0) continue;

        const suscripcion = result.rows[0];
        const userWA      = suscripcion.user_wa;
        const amountUSDC  = suscripcion.monto / 1_000_000; // lamports → USDC

        console.log(`[Helius] Remesa detectada para ${userWA} — ${amountUSDC} USDC`);

        // Disparar LidIA — genera oferta de cashback y envía Blink por WhatsApp
        if (userWA) {
          const blinkUrl   = `solana-action:${process.env.BLINKS_BASE_URL}/api/actions/lidia-retiro?amount=${amountUSDC}&wallet=${walletSolana}`;
          const previewUrl = `${process.env.BLINKS_BASE_URL}/api/actions/lidia-retiro/preview?amount=${amountUSDC}&wallet=${walletSolana}`;

          // 1. LidIA genera audio y mensaje de voz
          await notifyWithLidia({
            walletSolana,
            userWA,
            amountUSDC,
            zone:        suscripcion.zone ?? "",
            isUrgent:    false,
            suscripcionId: suscripcion.id,
          });

          // 2. Enviar preview URL (WhatsApp genera el card visual con OG tags)
          //    seguido del Blink URL para wallets compatibles
          await enviarMensaje(
            userWA,
            `🎟 *Tu enlace de retiro seguro:*\n\n${previewUrl}\n\n_O ábrelo directamente con tu wallet:_\n${blinkUrl}`
          );

          console.log(`[Helius] Blink enviado a ${userWA}: ${blinkUrl}`);
        }

        break; // Una notificación por tx
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("[Helius] Error procesando webhook:", err);
    return res.sendStatus(200); // Siempre 200 para que Helius no reintente
  }
});

function verifyEtherfuseSignature(body: object, signatureHeader: string): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    const canonicalized = canonicalize(body);
    if (!canonicalized) return false;
    const key = Buffer.from(WEBHOOK_SECRET, "base64");
    const hmac = createHmac("sha256", key).update(canonicalized).digest("hex");
    const expected = `sha256=${hmac}`;
    if (expected.length !== signatureHeader.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

router.post("/etherfuse", async (req, res) => {
  const signature = req.headers["x-signature"] as string | undefined;
  if (!verifyEtherfuseSignature(req.body, signature || "")) {
    return res.status(401).send("Invalid signature");
  }

  const eventType = req.body.eventType || req.body.event_type;
  const payload = req.body.payload || req.body;

  try {
    if (eventType === "order_updated") {
      const status = payload?.status || payload?.orderStatus;
      if (status === "completed") {
        const orderId = payload?.orderId || payload?.order_id;
        const customerId = payload?.customerId || payload?.customer_id;
        console.log("[Webhook] Order completed:", orderId);
        if (customerId) {
          const row = await pool.query(
            `SELECT destinatario_wa FROM beneficiarios_etherfuse WHERE etherfuse_customer_id = $1`,
            [customerId]
          );
          const wa = row.rows[0]?.destinatario_wa;
          if (wa) {
            await enviarMensaje(
              wa,
              "Tus MXN han llegado a tu cuenta bancaria. Revisa tu app del banco."
            );
          }
        }
      }
    }

    if (eventType === "customer_updated" || eventType === "kyc_updated") {
      const customerId = payload?.customerId || payload?.customer_id;
      const status = payload?.customerStatus || payload?.customer_status || payload?.status;
      if (customerId && status) {
        const kycStatus =
          status === "customer_verified" || status === "kyc_approved" ? "verified" :
          status === "customer_failed" || status === "kyc_rejected" ? "failed" : "pending";
        await pool.query(
          `UPDATE beneficiarios_etherfuse SET kyc_status = $1, updated_at = NOW()
           WHERE etherfuse_customer_id = $2`,
          [kycStatus, customerId]
        );
      }
    }

    if (eventType === "bank_account_updated") {
      console.log("[Webhook] Bank account updated:", payload?.bankAccountId || payload?.bank_account_id);
    }
  } catch (err) {
    console.error("[Webhook] Error procesando:", err);
  }

  res.sendStatus(200);
});

export default router;
