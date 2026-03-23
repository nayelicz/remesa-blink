/**
 * E2E: Crear suscripción USDC, marcar vencida, ejecutar keeper
 * Uso: npx tsx run-e2e-usdc.ts
 */
import "dotenv/config";
import { crearSuscripcion } from "./src/services/suscripciones.js";
import { ejecutarPagos } from "./src/keeper/cron.js";
import pool from "./src/db/pool.js";

// Usar E2E_DEST para wallet único; evita "account already in use"
const DEST = process.env.E2E_DEST ?? "Tvd1d4MaU6w42w14PAn2HahMGJkY8WnQd6t4tKnT8cT";

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

  console.log("3. Esperando confirmación on-chain (3s)...");
  await new Promise((r) => setTimeout(r, 3000));

  console.log("4. Ejecutando keeper...");
  await ejecutarPagos();

  console.log("5. Listo. Verifica tx en https://explorer.solana.com?cluster=devnet");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
