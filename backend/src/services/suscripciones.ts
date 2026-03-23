/**
 * Servicio de suscripciones (DB + Anchor)
 */
import { PublicKey } from "@solana/web3.js";
import pool from "../db/pool.js";
import {
  registrarSuscripcionOnChain,
  registrarSuscripcionUsdcOnChain,
  getSuscripcionPda,
  getSuscripcionUsdcPda,
  USDC_MINT,
} from "./solana.js";

const FRECUENCIA_MAP: Record<string, number> = {
  diario: 86400,
  semanal: 604800,
  mensual: 2592000,
};

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export interface NuevaSuscripcion {
  remitente_wa: string;
  destinatario_wa: string;
  destinatario_solana: string; // Requerido: wallet que recibe
  monto: number; // en SOL o USDC según tipo_activo
  frecuencia: "diario" | "semanal" | "mensual";
  tipo_activo?: "SOL" | "USDC"; // por defecto SOL
}

export async function crearSuscripcion(data: NuevaSuscripcion) {
  const now = new Date();
  const intervalo = FRECUENCIA_MAP[data.frecuencia] || 86400;
  const proximo_pago = addSeconds(now, intervalo);
  const tipo_activo = data.tipo_activo || "SOL";

  const destinatario = new PublicKey(data.destinatario_solana);
  const { getKeeperKeypair } = await import("./solana.js");
  const keeper = getKeeperKeypair();

  let txSig: string;
  let pda: PublicKey;
  let montoDb: number;

  if (tipo_activo === "USDC") {
    const montoRaw = BigInt(Math.round(data.monto * 1e6)); // USDC 6 decimals
    txSig = await registrarSuscripcionUsdcOnChain(
      keeper.publicKey,
      destinatario,
      montoRaw,
      data.frecuencia,
      USDC_MINT
    );
    [pda] = getSuscripcionUsdcPda(keeper.publicKey, destinatario, USDC_MINT);
    montoDb = Math.round(data.monto * 1e6); // guardar raw para BIGINT
  } else {
    const montoLamports = BigInt(Math.round(data.monto * 1e9));
    txSig = await registrarSuscripcionOnChain(
      keeper.publicKey,
      destinatario,
      montoLamports,
      data.frecuencia
    );
    [pda] = getSuscripcionPda(keeper.publicKey, destinatario);
    montoDb = Math.round(data.monto * 1e9); // lamports
  }

  const result = await pool.query(
    `INSERT INTO suscripciones (
      remitente_wa, destinatario_wa, destinatario_solana, monto, frecuencia, tipo_activo,
      proximo_pago, pda_address, activa
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
    RETURNING *`,
    [
      data.remitente_wa,
      data.destinatario_wa,
      data.destinatario_solana,
      montoDb,
      data.frecuencia,
      tipo_activo,
      proximo_pago,
      pda.toBase58(),
    ]
  );

  return { ...result.rows[0], tx_signature: txSig };
}

export async function listarSuscripcionesPorUsuario(wa: string) {
  const res = await pool.query(
    `SELECT * FROM suscripciones
     WHERE (remitente_wa = $1 OR destinatario_wa = $1) AND activa = true
     ORDER BY created_at DESC`,
    [wa]
  );
  return res.rows;
}

export async function listarSuscripcionesPendientesPago() {
  const res = await pool.query(
    `SELECT * FROM suscripciones
     WHERE activa = true AND proximo_pago <= NOW()
     ORDER BY proximo_pago ASC`
  );
  return res.rows;
}

export async function actualizarSuscripcionDespuesPago(
  id: string,
  ultimo_pago: Date,
  proximo_pago: Date
) {
  await pool.query(
    `UPDATE suscripciones
     SET ultimo_pago = $1, proximo_pago = $2, updated_at = NOW()
     WHERE id = $3`,
    [ultimo_pago, proximo_pago, id]
  );
}

export async function cancelarSuscripcion(id: string) {
  await pool.query(
    `UPDATE suscripciones SET activa = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
