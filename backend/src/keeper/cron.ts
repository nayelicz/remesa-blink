/**
 * Keeper: Cron job que ejecuta pagos recurrentes cada hora
 */
import "dotenv/config";
import cron from "node-cron";
import {
  listarSuscripcionesPendientesPago,
  actualizarSuscripcionDespuesPago,
} from "../services/suscripciones.js";
import { registrarCashbackPorRemesa } from "../services/cashback.js";
import {
  ejecutarPagoOnChain,
  ejecutarPagoUsdcOnChain,
  getKeeperKeypair,
} from "../services/solana.js";
import { PublicKey } from "@solana/web3.js";

const FRECUENCIA_SECONDS: Record<string, number> = {
  diario: 86400,
  semanal: 604800,
  mensual: 2592000,
};

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export async function ejecutarPagos() {
  console.log("[Keeper] Ejecutando pagos pendientes...");
  const pendientes = await listarSuscripcionesPendientesPago();

  for (const susc of pendientes) {
    try {
      const keeper = getKeeperKeypair();
      const destinatario = new PublicKey(susc.destinatario_solana);

      const txSig =
        susc.tipo_activo === "USDC"
          ? await ejecutarPagoUsdcOnChain(keeper.publicKey, destinatario)
          : await ejecutarPagoOnChain(keeper.publicKey, destinatario);

      const now = new Date();
      const intervalo = FRECUENCIA_SECONDS[susc.frecuencia] || 86400;
      const proximo = addSeconds(now, intervalo);

      await actualizarSuscripcionDespuesPago(susc.id, now, proximo);
      const montoHuman =
        susc.tipo_activo === "USDC"
          ? Number(susc.monto) / 1e6
          : Number(susc.monto) / 1e9;
      await registrarCashbackPorRemesa(susc.remitente_wa, montoHuman, susc.id);

      const blinkUrl = process.env.BLINKS_BASE_URL
        ? `${process.env.BLINKS_BASE_URL}/api/actions/enviar-remesa?amount=${montoHuman}&destination=${susc.destinatario_solana}`
        : null;

      console.log(
        `[Keeper] Pago ${susc.tipo_activo || "SOL"} ejecutado: ${susc.id} -> ${txSig} | Blink: ${blinkUrl || "N/A"}`
      );

      // TODO: Enviar notificación WhatsApp al destinatario (con Blink) y remitente
    } catch (err) {
      console.error(`[Keeper] Error en suscripcion ${susc.id}:`, err);
    }
  }
}

const intervalMin = parseInt(process.env.KEEPER_INTERVAL_MINUTES || "60", 10) || 60;
const cronExpr = intervalMin >= 60
  ? "0 * * * *"
  : `*/${Math.max(1, intervalMin)} * * * *`;

cron.schedule(cronExpr, ejecutarPagos);

console.log(`[Keeper] Iniciado. Ejecutará pagos cada ${intervalMin} minuto(s).`);
ejecutarPagos().catch(console.error);

// Mantener el proceso vivo
process.on("SIGINT", () => process.exit(0));
