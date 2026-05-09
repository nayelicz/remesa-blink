// ─────────────────────────────────────────────────────────
// worldIdService.ts  –  Verificación de identidad World ID
// Valida que el receptor sea una persona única (anti-sybil)
// antes de liberar el efectivo en tienda
// ─────────────────────────────────────────────────────────

import crypto from 'crypto';

const WORLD_ID_APP_ID  = process.env.WORLD_ID_APP_ID  ?? 'app_staging_remesa_blink';
const WORLD_ID_ACTION  = process.env.WORLD_ID_ACTION  ?? 'retiro-efectivo';
const WORLD_ID_API_URL = 'https://developer.worldcoin.org/api/v2/verify';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface WorldIDProof {
  merkle_root:         string;
  nullifier_hash:      string;
  proof:               string;
  verification_level:  'orb' | 'device';
}

export interface VerifyResult {
  ok:             boolean;
  nullifier_hash?: string;
  error?:         string;
  mock?:          boolean;
}

// ── Verificar prueba de World ID contra su API ────────────────────────────────
export async function verifyWorldID(
  signal:    string,   // ticket_code o wallet_solana del usuario
  proof:     WorldIDProof
): Promise<VerifyResult> {
  try {
    const response = await fetch(`${WORLD_ID_API_URL}/${WORLD_ID_APP_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:            WORLD_ID_ACTION,
        signal_hash:       hashSignal(signal),
        merkle_root:       proof.merkle_root,
        nullifier_hash:    proof.nullifier_hash,
        proof:             proof.proof,
        verification_level: proof.verification_level,
      }),
    });

    if (response.ok) {
      const data = await response.json() as { nullifier_hash: string };
      console.log(`[WorldID] Verificación exitosa → nullifier: ${data.nullifier_hash.slice(0, 16)}...`);
      return { ok: true, nullifier_hash: data.nullifier_hash };
    }

    const err = await response.json() as { detail?: string; code?: string };
    console.warn('[WorldID] Verificación falló:', err);
    return { ok: false, error: err.detail ?? err.code ?? 'Verificación fallida' };

  } catch (err) {
    console.error('[WorldID] Error de red:', err);
    return { ok: false, error: (err as Error).message };
  }
}

// ── Mock para demo sin World ID configurado ───────────────────────────────────
export async function verifyWorldIDMock(signal: string): Promise<VerifyResult> {
  console.log(`[WorldID MOCK] Verificando signal: ${signal}`);
  await new Promise(r => setTimeout(r, 300));
  return {
    ok:            true,
    nullifier_hash: `mock_nullifier_${hashSignal(signal).slice(0, 16)}`,
    mock:           true,
  };
}

// ── Función principal: real si está configurado, mock si no ───────────────────
export async function verifyIdentity(
  signal: string,
  proof?: WorldIDProof
): Promise<VerifyResult> {
  if (!WORLD_ID_APP_ID.startsWith('app_staging') && proof) {
    return verifyWorldID(signal, proof);
  }
  // En staging o sin proof → mock automático
  return verifyWorldIDMock(signal);
}

// ── Generar hash del signal (requerido por World ID) ─────────────────────────
function hashSignal(signal: string): string {
  return '0x' + crypto.createHash('sha256').update(signal).digest('hex');
}

// ── Generar URL de verificación para el widget de World ID ───────────────────
// Esta URL se envía al usuario para que escanee con World App
export function getWorldIDVerifyUrl(ticketCode: string, returnUrl: string): string {
  const params = new URLSearchParams({
    app_id:  WORLD_ID_APP_ID,
    action:  WORLD_ID_ACTION,
    signal:  ticketCode,
    return_to: returnUrl,
  });
  return `https://worldcoin.org/verify?${params.toString()}`;
}
