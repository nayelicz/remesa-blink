// ─────────────────────────────────────────────────────────
// pricingRoutes.ts  –  Rutas Express del Dynamic Pricing
//
// CÓMO INTEGRARLO AL BACKEND EXISTENTE:
//   En tu backend/src/index.ts (o app.ts) agrega:
//
//     import pricingRoutes from './pricing/pricingRoutes';
//     app.use('/api/pricing', pricingRoutes);
//
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { handlePricingRequest } from './pricingEngine';
import { getCurrentSlot, findNextSlotsOfType } from './timeSlots';
import { getStoresByZone } from './liquidityService';
import { WithdrawalRequest } from './types';

const router = Router();

// ── POST /api/pricing/quote ───────────────────────────────────────────────────
// Recibe una solicitud de retiro y devuelve la decisión de pricing completa
// incluye el script de LidIA listo para ElevenLabs TTS
//
// Body: { walletSolana, amountUSDC, userWA, zone?, preferredHour?, isUrgent }
// Response: { ok, decision: PricingDecision }
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const body = req.body as WithdrawalRequest;

    if (!body.walletSolana || !body.amountUSDC || !body.userWA) {
      return res.status(400).json({
        ok: false,
        error: 'Campos requeridos: walletSolana, amountUSDC, userWA',
      });
    }

    if (body.amountUSDC <= 0 || body.amountUSDC > 1000) {
      return res.status(400).json({
        ok: false,
        error: 'amountUSDC debe ser entre 0.01 y 1000',
      });
    }

    const result = await handlePricingRequest(body);
    return res.json(result);
  } catch (err) {
    console.error('[PricingRoutes] Error en /quote:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del pricing engine' });
  }
});

// ── GET /api/pricing/current-slot ────────────────────────────────────────────
// Devuelve el slot horario actual (útil para el dashboard y el bot)
router.get('/current-slot', (_req: Request, res: Response) => {
  const slot = getCurrentSlot();
  return res.json({ ok: true, slot });
});

// ── GET /api/pricing/valley-windows ──────────────────────────────────────────
// Devuelve las próximas ventanas de baja demanda (horas valle)
router.get('/valley-windows', (_req: Request, res: Response) => {
  const valleys = findNextSlotsOfType('valley', 24, 4);
  return res.json({ ok: true, valleys });
});

// ── GET /api/pricing/stores ───────────────────────────────────────────────────
// Devuelve tiendas disponibles filtradas por zona
// Query: ?zone=Coyoacán
router.get('/stores', async (req: Request, res: Response) => {
  try {
    const zone = (req.query.zone as string) ?? '';
    const slot = getCurrentSlot();
    const stores = await getStoresByZone(zone, slot.type);
    return res.json({ ok: true, stores, currentSlot: slot });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error obteniendo tiendas' });
  }
});

export default router;

// ─────────────────────────────────────────────────────────
// EJEMPLO DE USO desde el bot WhatsApp (bot/src/index.ts)
// ─────────────────────────────────────────────────────────
/*
  // Cuando llega una remesa nueva, pedir quote al pricing engine:

  const response = await fetch(`${API_BASE_URL}/api/pricing/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletSolana: beneficiario.wallet,
      amountUSDC: remesa.monto_usdc,
      userWA: beneficiario.telefono_wa,
      zone: beneficiario.zona ?? '',
      isUrgent: false,
    }),
  });

  const { decision } = await response.json();

  // El script ya está listo para ElevenLabs:
  console.log(decision.lidiaScript);
  // → "Hola, tienes disponibles 50 dólares en remesa. En este momento es hora
  //    de alta demanda. Si puedes esperar hasta las 14:00, en OXXO Insurgentes,
  //    te damos 2 dólares de cashback, casi 34.4 pesos extra..."

  // Enviar por WhatsApp como texto si no hay TTS aún:
  await sendWhatsAppMessage(beneficiario.telefono_wa, decision.lidiaScript);
*/
