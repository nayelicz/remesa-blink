/**
 * Servicio de notificaciones - Envía mensajes al bot WhatsApp
 */
const BOT_INTERNAL_URL = process.env.BOT_INTERNAL_URL || "http://localhost:3002";
const BOT_INTERNAL_SECRET = process.env.BOT_INTERNAL_SECRET || "";

export interface NotifPagoParams {
  destinatario_wa: string;
  remitente_wa: string;
  montoHuman: number;
  tipo_activo: string;
  blinkUrl: string | null;
  blinkOnboarding: string | null;
}

function buildMensajePago(params: NotifPagoParams): string {
  const { montoHuman, tipo_activo, blinkUrl, blinkOnboarding } = params;
  const activo = tipo_activo === "USDC" ? "USDC" : "SOL";
  let msg = `*Remesa recibida*\n\nRecibiste ${montoHuman} ${activo}. `;

  if (blinkUrl) {
    msg += `\n\n🔗 Para reclamar o convertir: ${blinkUrl}`;
  }
  if (blinkOnboarding) {
    msg += `\n\n📋 Si aún no registraste tu cuenta para recibir MXN: ${blinkOnboarding}`;
  }

  return msg;
}

export async function enviarMensaje(to: string, text: string): Promise<void> {
  if (!BOT_INTERNAL_URL || !to) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (BOT_INTERNAL_SECRET) {
    headers["Authorization"] = `Bearer ${BOT_INTERNAL_SECRET}`;
  }

  try {
    const res = await fetch(`${BOT_INTERNAL_URL}/internal/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[Notif] Error enviando:", res.status, err);
    }
  } catch (err) {
    console.error("[Notif] Error conectando con bot:", err instanceof Error ? err.message : err);
  }
}

export async function enviarNotificacionPago(params: NotifPagoParams): Promise<void> {
  if (!BOT_INTERNAL_URL) return;

  const mensaje = buildMensajePago(params);
  const to = params.destinatario_wa;
  if (!to) return;

  await enviarMensaje(to, mensaje);
}
