// ─────────────────────────────────────────────────────────
// lidiaAgent.ts  –  Agente de IA LidIA
// Orquesta: Pricing Engine → ElevenLabs TTS → WhatsApp
//
// Flujo completo:
//   1. Recibe notificación de remesa nueva
//   2. Consulta el Dynamic Pricing Engine
//   3. Genera audio con ElevenLabs
//   4. Envía texto + audio al receptor por WhatsApp
//   5. Espera respuesta del usuario (sí/no/hora)
//   6. Si acepta: reserva slot + emite cNFT ticket
// ─────────────────────────────────────────────────────────

import axios from 'axios';
import { generateAudioFile, cleanOldAudioFiles } from './elevenLabsService.js';
import type { PricingDecision, WithdrawalRequest } from '../pricing/types.js';

const API_BASE         = process.env.API_BASE_URL        ?? 'http://localhost:3000';
const BOT_INTERNAL_URL = process.env.BOT_INTERNAL_URL    ?? 'http://localhost:3002';
const BOT_SECRET       = process.env.BOT_INTERNAL_SECRET ?? '';
const USE_VOICE        = process.env.LIDIA_USE_VOICE      !== 'false'; // true por defecto

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface RemesaNotification {
  walletSolana:    string;
  userWA:          string;  // número del receptor con código de país, ej: "521234567890"
  amountUSDC:      number;
  zone?:           string;
  isUrgent?:       boolean;
  suscripcionId?:  number;
}

export interface LidiaResponse {
  ok:           boolean;
  decision?:    PricingDecision;
  audioPath?:   string;
  messageSent:  boolean;
  error?:       string;
}

// ── Enviar mensaje de texto al bot de WhatsApp ────────────────────────────────
async function sendWhatsAppText(to: string, text: string): Promise<void> {
  await axios.post(
    `${BOT_INTERNAL_URL}/internal/send`,
    { to, text },
    {
      headers: BOT_SECRET ? { Authorization: `Bearer ${BOT_SECRET}` } : {},
      timeout: 10_000,
    }
  );
}

// ── Enviar audio al bot de WhatsApp ──────────────────────────────────────────
async function sendWhatsAppAudio(to: string, audioPath: string): Promise<void> {
  await axios.post(
    `${BOT_INTERNAL_URL}/internal/send-audio`,
    { to, audioPath },
    {
      headers: BOT_SECRET ? { Authorization: `Bearer ${BOT_SECRET}` } : {},
      timeout: 15_000,
    }
  );
}

// ── Obtener decisión de pricing ───────────────────────────────────────────────
async function getPricingDecision(req: WithdrawalRequest): Promise<PricingDecision> {
  const res = await axios.post(`${API_BASE}/api/pricing/quote`, req, {
    timeout: 10_000,
  });
  return res.data.decision as PricingDecision;
}

// ── Orquestador principal ─────────────────────────────────────────────────────

export async function notifyWithLidia(notif: RemesaNotification): Promise<LidiaResponse> {
  console.log(`[LidIA] Procesando remesa para ${notif.userWA} — ${notif.amountUSDC} USDC`);

  try {
    // 1. Obtener decisión de pricing
    const decision = await getPricingDecision({
      walletSolana: notif.walletSolana,
      amountUSDC:   notif.amountUSDC,
      userWA:       notif.userWA,
      zone:         notif.zone,
      isUrgent:     notif.isUrgent ?? false,
    });

    console.log(`[LidIA] Pricing → slot: ${decision.timeSlot.type} | cashback: ${decision.cashbackUSDC} USDC`);

    let audioPath: string | undefined;

    // 2. Generar audio con ElevenLabs (si está habilitado y hay API key)
    if (USE_VOICE) {
      try {
        audioPath = await generateAudioFile(
          decision.lidiaScript,
          `lidia_${notif.userWA}_${Date.now()}.mp3`
        );
      } catch (voiceErr) {
        console.warn('[LidIA] ElevenLabs falló, usando solo texto:', (voiceErr as Error).message);
      }
    }

    // 3. Enviar mensaje de texto siempre (fallback garantizado)
    await sendWhatsAppText(notif.userWA, formatWhatsAppMessage(decision, notif.amountUSDC));

    // 4. Enviar audio si se generó correctamente
    if (audioPath) {
      try {
        await sendWhatsAppAudio(notif.userWA, audioPath);
      } catch (audioSendErr) {
        console.warn('[LidIA] No se pudo enviar audio, texto ya enviado');
      }
    }

    // 5. Limpiar audios viejos (async, sin bloquear)
    setImmediate(() => cleanOldAudioFiles());

    return { ok: true, decision, audioPath, messageSent: true };

  } catch (err) {
    const error = (err as Error).message;
    console.error('[LidIA] Error:', error);

    // Fallback: enviar mensaje simple sin pricing
    try {
      await sendWhatsAppText(
        notif.userWA,
        `*Remesa Blink*\n\nHola, has recibido una remesa de *${notif.amountUSDC} USDC*.\n\nEscribe /mis-remesas para ver tus opciones de retiro.`
      );
      return { ok: false, messageSent: true, error };
    } catch {
      return { ok: false, messageSent: false, error };
    }
  }
}

// ── Formatear mensaje WhatsApp con emojis ─────────────────────────────────────
function formatWhatsAppMessage(decision: PricingDecision, amountUSDC: number): string {
  const store  = decision.recommendedStores[0];
  const hora   = decision.optimalWindowStart.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  });
  const amountMXN = (amountUSDC * 17.20).toFixed(0);

  const slotEmoji = decision.timeSlot.type === 'peak'   ? '🔴' :
                    decision.timeSlot.type === 'valley'  ? '🟢' : '🟡';

  let msg = `🎙 *LidIA — Remesa Blink*\n\n`;
  msg += `💸 Has recibido *${amountUSDC} USDC* (~$${amountMXN} MXN)\n`;
  msg += `${slotEmoji} Ahora es *${decision.timeSlot.label}*\n\n`;

  if (decision.timeSlot.type === 'peak' || decision.urgencyFeeUSDC > 0) {
    msg += `⏰ *Oferta especial:*\n`;
    msg += `Si retiras a las *${hora}* en lugar de ahora, recibes:\n`;
    msg += `✅ *+${decision.cashbackUSDC} USDC de cashback* (~$${decision.cashbackMXN} MXN)\n`;
    if (store) msg += `📍 Sucursal: ${store.storeName} (${store.zone})\n`;
    msg += `\n_Ahorro total vs retiro inmediato: ${decision.savingsVsPeak} USDC_\n\n`;
    msg += `Responde:\n• *Sí* — Reservar turno para las ${hora}\n• *No* — Retirar ahora (comisión estándar)`;
  } else {
    msg += `✅ *¡Buen momento para retirar!*\n`;
    if (store) msg += `📍 ${store.storeName} (${store.zone}) tiene efectivo disponible\n`;
    msg += `\nResponde *Sí* para generar tu ticket de retiro digital 🎟`;
  }

  return msg;
}

// ── Procesar respuesta del usuario (sí/no/hora) ───────────────────────────────

export async function handleUserReply(
  userWA:   string,
  reply:    string,
  decision: PricingDecision,
  walletSolana: string,
  amountUSDC:   number,
): Promise<void> {
  const normalized = reply.trim().toLowerCase();
  const accepted   = ['si', 'sí', 'yes', 'ok', 'dale', 'va', 'bueno', 'claro'].includes(normalized);
  const rejected   = ['no', 'nop', 'nope', 'ahora', 'ya'].includes(normalized);

  if (accepted) {
    try {
      // Reservar slot en el aliado + generar ticket
      const res = await axios.post(`${API_BASE}/api/pricing/confirm-ticket`, {
        userWA,
        walletSolana,
        amountUSDC,
        storeId:     decision.recommendedStores[0]?.storeId,
        windowStart: decision.optimalWindowStart,
        cashbackUSDC: decision.cashbackUSDC,
      });

      const ticket = res.data.ticket;
      const store  = decision.recommendedStores[0];
      const hora   = decision.optimalWindowStart.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
      });

      await sendWhatsAppText(
        userWA,
        `✅ *¡Turno reservado!*\n\n` +
        `🎟 Código: *${ticket.ticketCode}*\n` +
        `📍 Sucursal: ${store?.storeName ?? 'Cercana'}\n` +
        `🕐 Ventana: ${hora} — ${decision.optimalWindowEnd.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}\n` +
        `💰 Cashback: +${decision.cashbackUSDC} USDC al retirar\n\n` +
        `_Lleva tu teléfono para validar con World ID 🌐_`
      );
    } catch (err) {
      await sendWhatsAppText(userWA, '❌ Error al reservar tu turno. Intenta de nuevo con /mis-remesas');
    }

  } else if (rejected) {
    await sendWhatsAppText(
      userWA,
      `Entendido. Puedes retirar ahora mismo.\n\n` +
      `Escribe */mis-remesas* para ver las sucursales disponibles 📍`
    );
  }
  // Si no es sí/no, ignorar (el bot principal lo manejará)
}
