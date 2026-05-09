// ─────────────────────────────────────────────────────────
// types.ts  –  Dynamic Pricing Engine · Remesa Blink
// ─────────────────────────────────────────────────────────

export type TimeSlotType = 'peak' | 'valley' | 'normal';

export interface TimeSlot {
  hour: number;          // 0–23 hora local CDMX
  type: TimeSlotType;
  label: string;         // etiqueta legible para LidIA
  demandScore: number;   // 0–100 (100 = máxima demanda)
}

export interface LiquiditySnapshot {
  storeId: string;
  storeName: string;
  zone: string;          // CDMX colonia / municipio
  availableCash: number; // MXN disponibles estimados
  needsCashOut: boolean; // si necesita deshacerse de efectivo
  lastUpdated: Date;
  source: 'bitso' | 'baz' | 'spin' | 'mock';
}

export interface PricingDecision {
  timeSlot: TimeSlot;
  baseFeeUSDC: number;
  adjustedFeeUSDC: number;
  cashbackUSDC: number;
  cashbackMXN: number;
  urgencyFeeUSDC: number;
  recommendedStores: LiquiditySnapshot[];
  optimalWindowStart: Date;
  optimalWindowEnd: Date;
  savingsVsPeak: number;     // USDC que ahorra vs retiro inmediato
  lidiaScript: string;       // texto listo para ElevenLabs TTS
}

export interface WithdrawalRequest {
  walletSolana: string;
  amountUSDC: number;
  userWA: string;
  zone?: string;             // zona preferida del usuario
  preferredHour?: number;   // hora preferida si la tienen
  isUrgent: boolean;
}
