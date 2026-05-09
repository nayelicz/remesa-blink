// ─────────────────────────────────────────────────────────
// pricingEngine.ts  –  Corazón del Dynamic Pricing
// Calcula fee, cashback, ventana óptima y genera el script
// de voz para LidIA (ElevenLabs TTS)
// ─────────────────────────────────────────────────────────

import { PricingDecision, WithdrawalRequest, LiquiditySnapshot } from './types';
import { getCurrentSlot, getBestValleyWindow } from './timeSlots';
import { getStoresByZone, getStoresWithSurplusCash } from './liquidityService';

// ── Parámetros de pricing ─────────────────────────────────────────────────────
const BASE_FEE_USDC        = 0.50;  // comisión base en cualquier momento
const URGENCY_FEE_USDC     = 0.75;  // cargo extra en hora pico con baja liquidez
const CASHBACK_VALLEY_USDC = 2.00;  // bono por esperar hora valle
const CASHBACK_SURPLUS_USDC= 1.00;  // bono adicional si la tienda necesita sacar efectivo
const MXN_PER_USDC         = 17.20; // tipo de cambio aproximado (actualizar en prod)

// ── Engine principal ──────────────────────────────────────────────────────────

export async function computePricing(req: WithdrawalRequest): Promise<PricingDecision> {
  const currentSlot = getCurrentSlot();
  const { start: optimalStart, end: optimalEnd, slot: valleySlot } = getBestValleyWindow();

  // Tiendas disponibles en la zona del usuario
  const storesNow    = await getStoresByZone(req.zone ?? '', currentSlot.type);
  const surplusStores= await getStoresWithSurplusCash(valleySlot.type);

  // ── Cálculo de fee ────────────────────────────────────────────────────────
  const lowLiquidityNow = storesNow.filter(s => s.availableCash >= req.amountUSDC * MXN_PER_USDC).length < 2;
  const urgencyFee      = (req.isUrgent && currentSlot.type === 'peak' && lowLiquidityNow)
                          ? URGENCY_FEE_USDC : 0;
  const adjustedFee     = BASE_FEE_USDC + urgencyFee;

  // ── Cálculo de cashback ───────────────────────────────────────────────────
  // Solo aplica si el usuario ACEPTA esperar a la ventana valle
  const hasSurplusStore = surplusStores.length > 0;
  const cashbackUSDC    = CASHBACK_VALLEY_USDC + (hasSurplusStore ? CASHBACK_SURPLUS_USDC : 0);
  const cashbackMXN     = parseFloat((cashbackUSDC * MXN_PER_USDC).toFixed(2));

  // Ahorro neto vs retiro inmediato en pico (fee + cashback)
  const savingsVsPeak   = parseFloat(((BASE_FEE_USDC + urgencyFee) - BASE_FEE_USDC + cashbackUSDC).toFixed(2));

  // Tiendas recomendadas para la ventana valle
  const recommendedStores: LiquiditySnapshot[] = surplusStores.length > 0
    ? surplusStores.slice(0, 3)
    : storesNow.slice(0, 3);

  // ── Script para LidIA (ElevenLabs TTS) ───────────────────────────────────
  const lidiaScript = buildLidiaScript({
    amountUSDC: req.amountUSDC,
    currentSlot,
    valleySlot,
    optimalStart,
    cashbackUSDC,
    cashbackMXN,
    recommendedStore: recommendedStores[0],
    savingsVsPeak,
    isUrgent: req.isUrgent,
    lowLiquidityNow,
  });

  return {
    timeSlot:          currentSlot,
    baseFeeUSDC:       BASE_FEE_USDC,
    adjustedFeeUSDC:   adjustedFee,
    cashbackUSDC,
    cashbackMXN,
    urgencyFeeUSDC:    urgencyFee,
    recommendedStores,
    optimalWindowStart: optimalStart,
    optimalWindowEnd:   optimalEnd,
    savingsVsPeak,
    lidiaScript,
  };
}

// ── Generador de script de voz ────────────────────────────────────────────────

interface ScriptParams {
  amountUSDC: number;
  currentSlot: ReturnType<typeof getCurrentSlot>;
  valleySlot:  ReturnType<typeof getCurrentSlot>;
  optimalStart: Date;
  cashbackUSDC: number;
  cashbackMXN:  number;
  recommendedStore?: LiquiditySnapshot;
  savingsVsPeak: number;
  isUrgent: boolean;
  lowLiquidityNow: boolean;
}

function buildLidiaScript(p: ScriptParams): string {
  const hora = p.optimalStart.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City'
  });
  const storeName = p.recommendedStore?.storeName ?? 'una tienda cercana';
  const amountMXN = (p.amountUSDC * 17.20).toFixed(0);

  if (p.isUrgent && p.lowLiquidityNow) {
    return (
      `Hola, has recibido una remesa de ${p.amountUSDC} dólares, ` +
      `equivalentes a ${amountMXN} pesos. ` +
      `Ahora mismo es ${p.currentSlot.label} y hay poca liquidez disponible cerca de ti, ` +
      `por lo que aplicaría una comisión de urgencia. ` +
      `Te propongo una opción mejor: si vas a ${storeName} hoy a las ${hora}, ` +
      `que es ${p.valleySlot.label}, te daremos un bono de ${p.cashbackUSDC} dólares, ` +
      `unos ${p.cashbackMXN} pesos adicionales. ` +
      `En total ahorrarías ${p.savingsVsPeak} dólares comparado con retirar ahora. ` +
      `¿Quieres que reserve tu turno para esa hora?`
    );
  }

  if (p.currentSlot.type === 'peak') {
    return (
      `Hola, tienes disponibles ${p.amountUSDC} dólares en remesa. ` +
      `En este momento es hora de alta demanda. ` +
      `Si puedes esperar hasta las ${hora}, en ${storeName}, ` +
      `te damos ${p.cashbackUSDC} dólares de cashback, ` +
      `casi ${p.cashbackMXN} pesos extra en tu bolsillo. ` +
      `¿Te acomoda esa hora?`
    );
  }

  // Normal o valley: retiro inmediato sin penalización
  return (
    `Hola, tu remesa de ${p.amountUSDC} dólares está lista. ` +
    `Ahora mismo es buen momento para retirar en ${storeName}. ` +
    `¿Quieres que te genere tu ticket de retiro digital?`
  );
}

// ── Endpoint helper: acepta petición y devuelve decisión serializable ─────────

export async function handlePricingRequest(body: WithdrawalRequest): Promise<{
  ok: boolean;
  decision: PricingDecision;
}> {
  const decision = await computePricing(body);
  return { ok: true, decision };
}
