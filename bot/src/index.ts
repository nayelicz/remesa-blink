/**
 * Bot WhatsApp - Remesa Blink
 * Baileys con reconexión y comandos
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import axios from "axios";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";

const logger = pino({ level: process.env.DEBUG ? "debug" : "info" });

function log(msg: string, color = "\x1b[0m") {
  console.log(`${color}${msg}\x1b[0m`);
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(
    join(__dirname, "../auth_info")
  );

  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version: version as [number, number, number],
    auth: state,
    printQRInTerminal: false,
    logger,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log("\n[Bot] Escanea el QR con WhatsApp:", "\x1b[33m");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      log(`[Bot] Desconectado. Reconectando: ${shouldReconnect}`, "\x1b[31m");
      if (shouldReconnect) {
        setTimeout(connect, 3000);
      }
    } else if (connection === "open") {
      log("[Bot] Conectado", "\x1b[32m");
      const me = sock.user;
      if (me?.id) {
        const num = me.id.replace(/:.*/, "").replace("@s.whatsapp.net", "");
        log(`[Bot] Tu número ES el bot. Para probar: envía un mensaje desde OTRO WhatsApp a +${num}`, "\x1b[36m");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      if (!m.message) continue;
      const jid = m.key.remoteJid!;
      const participant = m.key.participant;
      const fromMe = m.key.fromMe ?? false;
      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        "";
      // Ignorar fromMe salvo en "mensaje a ti mismo" (comandos que empiezan con /)
      if (fromMe && !text.trim().startsWith("/")) continue;
      const replyJid = participant || jid;
      log(`[Bot] Recibido de ${replyJid}: ${text.slice(0, 50)}${text.length > 50 ? "..." : ""}`, "\x1b[90m");
      try {
        await handleCommand(sock, replyJid, jid, text, fromMe);
      } catch (err) {
        log(`[Bot] Error: ${(err as Error).message}`, "\x1b[31m");
      }
    }
  });

  return sock;
}

async function handleCommand(
  sock: WASocket,
  replyJid: string,
  _chatJid: string,
  text: string,
  fromMe: boolean
) {
  const wa = replyJid.replace(/@.*/, "");

  const send = (msg: string) =>
    sock.sendMessage(replyJid, { text: msg });

  if (text.startsWith("/start") || text.startsWith("/ayuda")) {
    await send(
      `*Remesa Blink - Bot de Remesas Recurrentes*\n\n` +
        `Comandos:\n` +
        `• /recurrente [monto] [SOL|USDC] [frecuencia] [destinatario_wa] [wallet_solana] - Remesa recurrente (SOL por defecto)\n` +
        `• /mis-remesas - Ver suscripciones activas\n` +
        `• /cashback o /mis-recompensas - Ver saldo cashback\n` +
        `• /generar-codigo - Generar código de referido\n` +
        `• /canjear [monto] - Canjear cashback\n` +
        `• /soporte - Contactar soporte`
    );
    return;
  }

  if (text.startsWith("/recurrente ")) {
    const parts = text.slice(11).trim().split(/\s+/);
    if (parts.length < 4) {
      await send("Uso: /recurrente [monto] [SOL|USDC] [diario|semanal|mensual] [destinatario_wa] [wallet_solana]");
      return;
    }
    let montoStr: string, frecuencia: string, destinatario_wa: string, wallet_solana: string;
    let tipo_activo: "SOL" | "USDC" = "SOL";
    if (parts.length >= 5 && /^(SOL|USDC)$/i.test(parts[1])) {
      [montoStr, , frecuencia, destinatario_wa, wallet_solana] = parts;
      tipo_activo = parts[1].toUpperCase() as "SOL" | "USDC";
    } else {
      [montoStr, frecuencia, destinatario_wa, wallet_solana] = parts;
    }
    const monto = parseFloat(montoStr);
    if (isNaN(monto) || monto <= 0) {
      await send("Monto inválido");
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/api/suscripciones`, {
        remitente_wa: wa,
        destinatario_wa,
        destinatario_solana: wallet_solana,
        tipo_activo,
        monto,
        frecuencia: frecuencia.toLowerCase(),
      });
      await send(
        `Suscripción creada. Tx: ${res.data.tx_signature || "N/A"}`
      );
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : (err as Error).message;
      await send(`Error: ${msg}`);
    }
    return;
  }

  if (text === "/mis-remesas") {
    try {
      const res = await axios.get(`${API_BASE}/api/suscripciones/${wa}`);
      const list = res.data;
      if (list.length === 0) {
        await send("No tienes suscripciones activas.");
      } else {
        const lines = list.map(
          (s: { monto: number; frecuencia: string; destinatario_wa: string; tipo_activo?: string }) =>
            `• ${s.monto} ${s.tipo_activo || "SOL"} - ${s.frecuencia} -> ${s.destinatario_wa}`
        );
        await send("Tus remesas recurrentes:\n" + lines.join("\n"));
      }
    } catch (err) {
      await send("Error al obtener suscripciones");
    }
    return;
  }

  if (text === "/cashback" || text === "/mis-recompensas") {
    try {
      const res = await axios.get(`${API_BASE}/api/cashback/${wa}`);
      const d = res.data;
      await send(
        `*Cashback*\n` +
          `Total: ${d.total_acumulado}\n` +
          `Disponible: ${d.disponible}\n` +
          `Código referido: ${d.codigo_referido || "N/A"}`
      );
    } catch (err) {
      await send("Error al obtener cashback");
    }
    return;
  }

  if (text === "/generar-codigo") {
    try {
      const res = await axios.post(`${API_BASE}/api/cashback/generar-codigo`, {
        usuario_wa: wa,
      });
      await send(`Tu código de referido: ${res.data.codigo}`);
    } catch (err) {
      await send("Error al generar código");
    }
    return;
  }

  if (text.startsWith("/canjear ")) {
    const montoStr = text.slice(9).trim();
    const monto = parseFloat(montoStr);
    if (isNaN(monto) || monto <= 0) {
      await send("Uso: /canjear [monto]");
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/api/cashback/canjear`, {
        usuario_wa: wa,
        monto,
      });
      await send(res.data.mensaje || "Canje realizado");
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : (err as Error).message;
      await send(`Error: ${msg}`);
    }
    return;
  }

  if (text === "/soporte") {
    await send("Contacta a soporte: soporte@remesablink.com");
    return;
  }

  // Comando no reconocido (no responder si es fromMe para evitar loop)
  if (text.trim().length > 0 && !fromMe) {
    await send("Escribe /ayuda para ver los comandos disponibles.");
  }
}

connect().catch(console.error);
