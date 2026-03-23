/**
 * E2E: Crear suscripción USDC, marcar vencida, ejecutar keeper
 * Uso: npx tsx run-e2e-usdc.ts
 */
import "dotenv/config";
import { Keypair } from "@solana/web3.js";
import { crearSuscripcion } from "./src/services/suscripciones.js";
import { ejecutarPagos } from "./src/keeper/cron.js";
import { getConnection, getSuscripcionUsdcPda, getKeeperKeypair, USDC_MINT } from "./src/services/solana.js";
import pool from "./src/db/pool.js";

// E2E_DEST fijo o generar uno nuevo para evitar "account already in use"
const DEST =
  process.env.E2E_DEST ??
  Keypair.generate().publicKey.toBase58();

async function waitForAccount(susc: { destinatario_solana: string }) {
  const conn = getConnection();
  const keeper = getKeeperKeypair();
  const { PublicKey } = await import("@solana/web3.js");
  const dest = new PublicKey(susc.destinatario_solana);
  const [pda] = getSuscripcionUsdcPda(keeper.publicKey, dest, USDC_MINT);
  for (let i = 0; i < 30; i++) {
    const info = await conn.getAccountInfo(pda);
    if (info) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timeout esperando cuenta on-chain");
}

async function main() {
  console.log("1. Creando suscripción USDC...");
  const susc = await crearSuscripcion({
    remitente_wa: "5215550000000",
    destinatario_wa: "5215550000001",
    destinatario_solana: DEST,
    monto: 0.1,
    frecuencia: "diario",
    tipo_activo: "USDC",
  });
  console.log("   OK:", susc.id, susc.tx_signature);

  console.log("2. Marcando proximo_pago como vencido...");
  await pool.query(
    `UPDATE suscripciones SET proximo_pago = NOW() - interval '1 second' WHERE id = $1`,
    [susc.id]
  );

  console.log("3. Esperando cuenta on-chain...");
  await waitForAccount(susc);

  console.log("4. Ejecutando keeper...");
  await ejecutarPagos();

  console.log("5. Listo. Verifica tx en https://explorer.solana.com?cluster=devnet");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
