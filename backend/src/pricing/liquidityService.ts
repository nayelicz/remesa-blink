// ─────────────────────────────────────────────────────────
// liquidityService.ts  –  Disponibilidad de efectivo
// Integra (mock) con Bitso / Baz / Spin
// En producción: reemplaza las funciones mock con llamadas reales a sus APIs
// ─────────────────────────────────────────────────────────

import { LiquiditySnapshot, TimeSlotType } from './types';

// ── Mock data: tiendas CDMX con disponibilidad simulada ──────────────────────
const STORE_POOL: Omit<LiquiditySnapshot, 'availableCash' | 'needsCashOut' | 'lastUpdated'>[] = [
  { storeId: 'spin-001', storeName: 'OXXO Insurgentes',     zone: 'Roma Norte',       source: 'spin' },
  { storeId: 'spin-002', storeName: 'OXXO Álvaro Obregón',  zone: 'Álvaro Obregón',   source: 'spin' },
  { storeId: 'baz-001',  storeName: '7-Eleven Condesa',     zone: 'Condesa',           source: 'baz'  },
  { storeId: 'baz-002',  storeName: '7-Eleven Coyoacán',    zone: 'Coyoacán',          source: 'baz'  },
  { storeId: 'baz-003',  storeName: '7-Eleven Tlalpan',     zone: 'Tlalpan',           source: 'baz'  },
  { storeId: 'bitso-001',storeName: 'Punto Bitso Iztapalapa',zone: 'Iztapalapa',       source: 'bitso'},
  { storeId: 'bitso-002',storeName: 'Punto Bitso Ecatepec', zone: 'Ecatepec',          source: 'bitso'},
];

// Simula disponibilidad real basada en hora del día y demanda
function simulateLiquidity(
  store: typeof STORE_POOL[0],
  slotType: TimeSlotType
): LiquiditySnapshot {
  // En hora pico, las tiendas ya dieron mucho efectivo → menos disponible
  const baseMin = slotType === 'peak'   ? 500  :
                  slotType === 'valley' ? 5000 : 2000;
  const baseMax = slotType === 'peak'   ? 3000 :
                  slotType === 'valley' ? 20000: 8000;

  const available = Math.floor(Math.random() * (baseMax - baseMin) + baseMin);

  // needsCashOut: si tienen demasiado efectivo (antes del camión de valores)
  // esto es lo que genera el incentivo de cashback
  const needsCashOut = slotType === 'valley' && available > 8000;

  return {
    ...store,
    availableCash: available,
    needsCashOut,
    lastUpdated: new Date(),
  };
}

// ── Interfaz pública ─────────────────────────────────────────────────────────

export async function getStoresByZone(
  zone: string,
  slotType: TimeSlotType
): Promise<LiquiditySnapshot[]> {
  // TODO producción: GET https://api.spin.mx/v1/stores?zone=...
  // TODO producción: GET https://api.baz.mx/liquidity?zone=...
  // TODO producción: GET https://api.bitso.com/v3/cash_points?zone=...

  const filtered = zone
    ? STORE_POOL.filter(s => s.zone.toLowerCase().includes(zone.toLowerCase()))
    : STORE_POOL;

  const pool = filtered.length > 0 ? filtered : STORE_POOL;

  return pool
    .map(s => simulateLiquidity(s, slotType))
    .sort((a, b) => b.availableCash - a.availableCash);
}

export async function getStoresWithSurplusCash(
  slotType: TimeSlotType
): Promise<LiquiditySnapshot[]> {
  const all = await getStoresByZone('', slotType);
  return all.filter(s => s.needsCashOut && s.availableCash > 5000);
}

export async function reserveSlot(
  storeId: string,
  amountMXN: number,
  windowStart: Date
): Promise<{ code: string; expiresAt: Date }> {
  // TODO producción: POST a API del aliado para apartar disponibilidad
  const code = `RB-${storeId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const expiresAt = new Date(windowStart.getTime() + 4 * 3600_000); // válido 4h
  console.log(`[LiquidityService] Reserva aparatada → ${code} en ${storeId} por ${amountMXN} MXN`);
  return { code, expiresAt };
}
