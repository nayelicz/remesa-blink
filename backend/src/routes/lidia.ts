// ─────────────────────────────────────────────────────────
// lidia.ts  –  Rutas Express del Agente LidIA
//
// INTEGRAR en backend/src/app.ts:
//   import lidiaRouter from './routes/lidia.js';
//   app.use('/api/lidia', lidiaRouter);
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { notifyWithLidia, handleUserReply } from '../services/lidiaAgent.js';
import { reserveSlot } from '../pricing/liquidityService.js';
import type { PricingDecision } from '../pricing/types.js';
import pool from '../db/pool.js';  // usa el pool existente del proyecto

const router = Router();

// Almacén en memoria de decisiones pendientes (en prod: usar Redis o DB)
// key: userWA  →  { decision, walletSolana, amountUSDC, expiresAt }
const pendingDecisions = new Map<string, {
  decision:     PricingDecision;
  walletSolana: string;
  amountUSDC:   number;
  expiresAt:    Date;
}>();

// ── POST /api/lidia/notify ────────────────────────────────────────────────────
// El keeper llama este endpoint cuando detecta una remesa nueva para notificar
// Body: { walletSolana, userWA, amountUSDC, zone?, isUrgent?, suscripcionId? }
router.post('/notify', async (req: Request, res: Response) => {
  try {
    const { walletSolana, userWA, amountUSDC, zone, isUrgent, suscripcionId } = req.body;

    if (!walletSolana || !userWA || !amountUSDC) {
      return res.status(400).json({ ok: false, error: 'walletSolana, userWA y amountUSDC son requeridos' });
    }

    const result = await notifyWithLidia({ walletSolana, userWA, amountUSDC, zone, isUrgent, suscripcionId });

    // Guardar decisión pendiente para cuando el usuario responda
    if (result.decision) {
      pendingDecisions.set(userWA, {
        decision:     result.decision,
        walletSolana,
        amountUSDC,
        expiresAt:    new Date(Date.now() + 4 * 3600_000), // expira en 4h
      });
    }

    // Guardar en DB para auditoría
    if (result.decision) {
      await pool.query(
        `INSERT INTO pricing_decisions
         (wallet_solana, user_wa, amount_usdc, zone, time_slot_type,
          base_fee_usdc, adjusted_fee_usdc, urgency_fee_usdc,
          cashback_usdc, cashback_mxn, savings_vs_peak, lidia_script)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          walletSolana, userWA, amountUSDC, zone ?? null,
          result.decision.timeSlot.type,
          result.decision.baseFeeUSDC, result.decision.adjustedFeeUSDC,
          result.decision.urgencyFeeUSDC, result.decision.cashbackUSDC,
          result.decision.cashbackMXN, result.decision.savingsVsPeak,
          result.decision.lidiaScript,
        ]
      );
    }

    return res.json({ ok: result.ok, messageSent: result.messageSent });
  } catch (err) {
    console.error('[LidIA Route] /notify error:', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── POST /api/lidia/reply ─────────────────────────────────────────────────────
// El bot llama este endpoint cuando el usuario responde "sí" o "no"
// Body: { userWA, reply }
router.post('/reply', async (req: Request, res: Response) => {
  try {
    const { userWA, reply } = req.body;
    if (!userWA || !reply) {
      return res.status(400).json({ ok: false, error: 'userWA y reply son requeridos' });
    }

    const pending = pendingDecisions.get(userWA);
    if (!pending || new Date() > pending.expiresAt) {
      pendingDecisions.delete(userWA);
      return res.status(404).json({ ok: false, error: 'No hay decisión pendiente para este usuario' });
    }

    await handleUserReply(
      userWA, reply,
      pending.decision, pending.walletSolana, pending.amountUSDC
    );

    // Si aceptó, limpiar la decisión pendiente
    const accepted = ['si','sí','yes','ok','dale','va','bueno','claro'].includes(reply.trim().toLowerCase());
    if (accepted) pendingDecisions.delete(userWA);

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── POST /api/pricing/confirm-ticket ─────────────────────────────────────────
// Confirma el ticket: reserva en aliado + guarda en DB
// (LidiaAgent lo llama internamente cuando el usuario dice "sí")
router.post('/confirm-ticket', async (req: Request, res: Response) => {
  try {
    const { userWA, walletSolana, amountUSDC, storeId, windowStart, cashbackUSDC } = req.body;

    // Reservar slot en el aliado
    const { code, expiresAt } = await reserveSlot(
      storeId ?? 'spin-001',
      amountUSDC * 17.20,
      new Date(windowStart)
    );

    // Guardar ticket en DB
    const result = await pool.query(
      `INSERT INTO withdrawal_tickets
       (ticket_code, wallet_solana, user_wa, amount_usdc,
        store_id, store_name, zone, source,
        window_start, window_end, cashback_usdc, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        code, walletSolana, userWA, amountUSDC,
        storeId ?? 'spin-001', 'Tienda Aliada', null, 'spin',
        new Date(windowStart),
        new Date(new Date(windowStart).getTime() + 2 * 3600_000),
        cashbackUSDC ?? 0,
        expiresAt,
      ]
    );

    return res.json({ ok: true, ticket: { ticketCode: code, ...result.rows[0] } });
  } catch (err) {
    console.error('[LidIA Route] /confirm-ticket error:', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── GET /api/lidia/ticket/:userWA ─────────────────────────────────────────────
// Consultar tickets activos de un usuario
router.get('/ticket/:userWA', async (req: Request, res: Response) => {
  try {
    const { userWA } = req.params;
    const result = await pool.query(
      `SELECT * FROM withdrawal_tickets WHERE user_wa=$1 AND status='pending' ORDER BY created_at DESC LIMIT 5`,
      [userWA]
    );
    return res.json({ ok: true, tickets: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── POST /api/lidia/redeem ────────────────────────────────────────────────────
// Marcar ticket como canjeado (World ID verificado en tienda)
router.post('/redeem', async (req: Request, res: Response) => {
  try {
    const { ticketCode, worldIdVerified } = req.body;
    if (!ticketCode) return res.status(400).json({ ok: false, error: 'ticketCode requerido' });

    await pool.query(
      `UPDATE withdrawal_tickets
       SET status='redeemed', world_id_verified=$1, redeemed_at=NOW()
       WHERE ticket_code=$2`,
      [worldIdVerified ?? false, ticketCode]
    );

    return res.json({ ok: true, message: 'Ticket canjeado correctamente' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
