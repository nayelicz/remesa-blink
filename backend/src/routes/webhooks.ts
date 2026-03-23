/**
 * Webhooks - Etherfuse, etc.
 */
import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import canonicalize from "canonicalize";
import pool from "../db/pool.js";

const router = Router();
const WEBHOOK_SECRET = process.env.ETHERFUSE_WEBHOOK_SECRET || "";

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
        console.log("[Webhook] Order completed:", payload?.orderId || payload?.order_id);
        // TODO: Notificar al beneficiario por WhatsApp que MXN llegó
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
