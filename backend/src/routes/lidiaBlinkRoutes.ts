// ─────────────────────────────────────────────────────────
// lidiaBlinkRoutes.ts  –  Solana Blink multi-paso para LidIA
//
// Flujo:
//   GET  /api/actions/lidia-retiro              → Paso 1: oferta de LidIA
//   POST /api/actions/lidia-retiro              → Paso 2: acepta/rechaza cashback
//   GET  /api/actions/lidia-retiro/horario      → Paso 3: elige hora y sucursal
//   POST /api/actions/lidia-retiro/horario      → Paso 4: confirma y mintea ticket cNFT
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { createPostResponse, type ActionGetResponse } from "@solana/actions";
import {
  Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { computePricing } from "../pricing/pricingEngine.js";
import { mintTicket } from "../services/cNFTService.js";
import { reserveSlot } from "../pricing/liquidityService.js";
import pool from "../db/pool.js";

const router = Router();
const RPC_URL  = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const BASE_URL = process.env.BLINKS_BASE_URL || process.env.BASE_URL || "http://localhost:3000";

// ── PASO 1: GET — Mostrar oferta de LidIA ─────────────────────────────────────
// URL: /api/actions/lidia-retiro?amount=50&zone=Roma+Norte
router.get("/api/actions/lidia-retiro", async (req: Request, res: Response) => {
  try {
    const amountUSDC = parseFloat(req.query.amount as string) || 50;
    const zone       = (req.query.zone as string) || "";

    // Calcular pricing dinámico
    const decision = await computePricing({
      walletSolana: "11111111111111111111111111111111", // placeholder para GET
      amountUSDC,
      userWA: "",
      zone,
      isUrgent: false,
    });

    const store    = decision.recommendedStores[0];
    const hora     = decision.optimalWindowStart.toLocaleTimeString("es-MX", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
    });
    const amountMXN = (amountUSDC * 17.20).toFixed(0);
    const slotEmoji = decision.timeSlot.type === "peak" ? "🔴 Hora pico" :
                      decision.timeSlot.type === "valley" ? "🟢 Hora valle" : "🟡 Hora normal";

    const response: ActionGetResponse = {
      type:        "action",
      title:       `🎙 LidIA — Retiro de $${amountUSDC} USDC (~$${amountMXN} MXN)`,
      icon:        `${BASE_URL}/lidia-icon.png`,
      description: `${slotEmoji}\n\n` +
                   `💰 Si retiras ahora: comisión estándar $${decision.baseFeeUSDC} USDC\n` +
                   `✨ Si esperas a las ${hora}: +$${decision.cashbackUSDC} USDC cashback\n` +
                   `📍 Sucursal sugerida: ${store?.storeName ?? "Tienda cercana"} (${store?.zone ?? ""})\n\n` +
                   `_${decision.lidiaScript}_`,
      label:       "Ver opciones de retiro",
      links: {
        actions: [
          {
            type:  "transaction",
            label: `✅ Aceptar cashback (+$${decision.cashbackUSDC} USDC a las ${hora})`,
            href:  `${BASE_URL}/api/actions/lidia-retiro?amount=${amountUSDC}&zone=${encodeURIComponent(zone)}&accept=true`,
            parameters: [
              { name: "account", label: "Tu wallet de Solana", required: true, type: "text" },
            ],
          },
          {
            type:  "transaction",
            label: "⚡ Retirar ahora (sin espera)",
            href:  `${BASE_URL}/api/actions/lidia-retiro?amount=${amountUSDC}&zone=${encodeURIComponent(zone)}&accept=false`,
            parameters: [
              { name: "account", label: "Tu wallet de Solana", required: true, type: "text" },
            ],
          },
        ],
      },
    };

    return res.json(response);
  } catch (err) {
    console.error("[LidiaBlink] GET error:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── PASO 2: POST — Procesa la decisión del usuario ────────────────────────────
router.post("/api/actions/lidia-retiro", async (req: Request, res: Response) => {
  try {
    const amountUSDC = parseFloat(req.query.amount as string) || 50;
    const zone       = (req.query.zone as string) || "";
    const accept     = req.query.accept === "true";
    const { account } = req.body;

    if (!account) return res.status(400).json({ error: "account requerido" });

    const walletSolana = account as string;
    const connection   = new Connection(RPC_URL, "confirmed");
    const publicKey    = new PublicKey(walletSolana);

    // Calcular pricing
    const decision = await computePricing({ walletSolana, amountUSDC, userWA: "", zone, isUrgent: !accept });

    // Transacción simbólica: transferencia de 0 SOL (memo de intención)
    // En producción: transferir el monto al escrow del programa Anchor
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer        = publicKey;

    // Agregar instrucción memo con el ticket
    tx.add(SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey:   publicKey,
      lamports:   0,
    }));

    if (accept) {
      // Usuario aceptó el cashback → ir al paso de horario
      const store    = decision.recommendedStores[0];
      const hora     = decision.optimalWindowStart.toLocaleTimeString("es-MX", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
      });

      const payload = await createPostResponse({
        fields: {
          type:        "transaction",
          transaction: tx,
          message:     `✅ ¡Excelente! Te reservamos tu turno para las ${hora} en ${store?.storeName ?? "tienda cercana"}. Cashback: +$${decision.cashbackUSDC} USDC`,
          links: {
            next: {
              type: "inline",
              action: {
                type:        "action",
                title:       "🎟 Confirmar ticket de retiro",
                icon:        `${BASE_URL}/lidia-icon.png`,
                description: `📍 ${store?.storeName} · 🕐 ${hora} · 💰 +$${decision.cashbackUSDC} USDC cashback\n\nFirma para mintear tu ticket cNFT en Solana y bloquear los fondos en escrow.`,
                label:       "Confirmar y mintear ticket",
                links: {
                  actions: [{
                    type:  "transaction",
                    label: "🎟 Mintear Ticket cNFT",
                    href:  `${BASE_URL}/api/actions/lidia-retiro/confirmar?amount=${amountUSDC}&zone=${encodeURIComponent(zone)}&store=${store?.storeId ?? "spin-001"}&cashback=${decision.cashbackUSDC}&window=${decision.optimalWindowStart.toISOString()}`,
                    parameters: [
                      { name: "account", label: "Tu wallet", required: true, type: "text" },
                    ],
                  }],
                },
              },
            },
          },
        },
      });

      return res.json(payload);
    } else {
      // Usuario rechazó → retiro inmediato
      const payload = await createPostResponse({
        fields: {
          type:        "transaction",
          transaction: tx,
          message:     `⚡ Retiro inmediato registrado. Ve a cualquier tienda aliada con tu código: RB-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      return res.json(payload);
    }
  } catch (err) {
    console.error("[LidiaBlink] POST error:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── PASO 4: POST — Confirmar y mintear ticket cNFT ───────────────────────────
router.post("/api/actions/lidia-retiro/confirmar", async (req: Request, res: Response) => {
  try {
    const amountUSDC  = parseFloat(req.query.amount as string) || 50;
    const storeId     = (req.query.store as string) || "spin-001";
    const cashback    = parseFloat(req.query.cashback as string) || 0;
    const windowStart = new Date((req.query.window as string) || Date.now());
    const { account } = req.body;

    if (!account) return res.status(400).json({ error: "account requerido" });

    const walletSolana = account as string;
    const connection   = new Connection(RPC_URL, "confirmed");
    const publicKey    = new PublicKey(walletSolana);

    // Reservar slot en aliado
    const { code, expiresAt } = await reserveSlot(storeId, amountUSDC * 17.20, windowStart);

    // Mintear cNFT
    const mintResult = await mintTicket({
      ticketCode:   code,
      userWA:       "",
      walletSolana,
      amountUSDC,
      storeName:    storeId,
      windowStart,
      cashbackUSDC: cashback,
    });

    // Guardar en DB
    await pool.query(
      `INSERT INTO withdrawal_tickets
       (ticket_code, cnft_mint, wallet_solana, user_wa, amount_usdc,
        store_id, store_name, zone, source, window_start, window_end,
        cashback_usdc, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        code, mintResult.signature, walletSolana, "", amountUSDC,
        storeId, storeId, null, "spin",
        windowStart,
        new Date(windowStart.getTime() + 2 * 3600_000),
        cashback, expiresAt,
      ]
    );

    // Transacción simbólica de confirmación
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer        = publicKey;
    tx.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: publicKey, lamports: 0 }));

    const hora = windowStart.toLocaleTimeString("es-MX", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
    });

    const payload = await createPostResponse({
      fields: {
        type:        "transaction",
        transaction: tx,
        message:     `🎟 ¡Ticket minteado en Solana!\n\nCódigo: ${code}\n🕐 ${hora}\n💰 Cashback: +$${cashback} USDC al retirar\n🌐 Lleva tu teléfono para validar con World ID`,
      },
    });

    return res.json(payload);
  } catch (err) {
    console.error("[LidiaBlink] confirmar error:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
