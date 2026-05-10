/**
 * App Express - Backend + Blinks
 * Exportado para tests; index.ts importa y escucha.
 */
import "dotenv/config";
import express from "express";
import suscripcionesRouter from "./routes/suscripciones.js";
import cashbackRouter from "./routes/cashback.js";
import etherfuseRouter from "./routes/etherfuse.js";
import webhooksRouter from "./routes/webhooks.js";
import blinksRouter from "./routes/blinks.js";
import pricingRouter from "./pricing/pricingRoutes.js";
import lidiaRouter from "./routes/lidia.js";
import lidiaBlinkRouter from "./routes/lidiaBlinkRoutes.js";

const app = express();
app.use(express.json());

// CORS abierto — requerido para Blinks y para las APIs de LidIA
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids');
  res.setHeader('X-Action-Version', '1');
  res.setHeader('X-Blockchain-Ids', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Página de inicio
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Remesa Blink — API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 2.5rem; max-width: 600px; width: 100%; }
    .logo { font-size: 2rem; font-weight: 800; background: linear-gradient(90deg, #9945FF, #14F195); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem; }
    .tagline { color: #888; font-size: 0.95rem; margin-bottom: 2rem; }
    .status { display: flex; align-items: center; gap: 0.5rem; background: #0d2e1a; border: 1px solid #14F195; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 2rem; font-size: 0.9rem; color: #14F195; }
    .dot { width: 8px; height: 8px; background: #14F195; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .section-title { font-size: 0.75rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; }
    .endpoints { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem; }
    .endpoint { display: flex; align-items: center; gap: 0.75rem; background: #111; border: 1px solid #222; border-radius: 8px; padding: 0.6rem 0.9rem; text-decoration: none; transition: border-color 0.2s; }
    .endpoint:hover { border-color: #9945FF; }
    .method { font-size: 0.7rem; font-weight: 700; color: #14F195; background: #0d2e1a; padding: 0.2rem 0.4rem; border-radius: 4px; min-width: 36px; text-align: center; }
    .method.post { color: #FF9945; background: #2e1a0d; }
    .path { font-size: 0.85rem; color: #ccc; font-family: monospace; }
    .desc { font-size: 0.75rem; color: #555; margin-left: auto; }
    .footer { margin-top: 2rem; font-size: 0.75rem; color: #444; text-align: center; }
    .badge { display: inline-block; background: #1a1a2e; border: 1px solid #9945FF33; color: #9945FF; font-size: 0.7rem; padding: 0.2rem 0.6rem; border-radius: 20px; margin: 0.2rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ Remesa Blink</div>
    <div class="tagline">Remesas recurrentes con IA · Solana · WhatsApp</div>

    <div class="status">
      <div class="dot"></div>
      Sistema operativo · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} CDMX
    </div>

    <div class="section-title">Endpoints principales</div>
    <div class="endpoints">
      <a class="endpoint" href="/health">
        <span class="method">GET</span>
        <span class="path">/health</span>
        <span class="desc">Estado del servidor</span>
      </a>
      <a class="endpoint" href="/api/pricing/current-slot">
        <span class="method">GET</span>
        <span class="path">/api/pricing/current-slot</span>
        <span class="desc">Slot horario actual</span>
      </a>
      <a class="endpoint" href="/api/pricing/stores">
        <span class="method">GET</span>
        <span class="path">/api/pricing/stores</span>
        <span class="desc">Tiendas con liquidez</span>
      </a>
      <a class="endpoint" href="/api/pricing/valley-windows">
        <span class="method">GET</span>
        <span class="path">/api/pricing/valley-windows</span>
        <span class="desc">Ventanas de baja demanda</span>
      </a>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/pricing/quote</span>
        <span class="desc">Cotización de retiro</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/lidia/notify</span>
        <span class="desc">Notificar remesa a LidIA</span>
      </div>
    </div>

    <div class="section-title">Stack tecnológico</div>
    <div>
      <span class="badge">Solana</span>
      <span class="badge">Anchor</span>
      <span class="badge">USDC</span>
      <span class="badge">ElevenLabs</span>
      <span class="badge">World ID</span>
      <span class="badge">Metaplex</span>
      <span class="badge">Etherfuse</span>
      <span class="badge">WhatsApp</span>
    </div>

    <div class="footer">
      Remesa Blink · Dev3pack Hackathon 2025 · Build on Solana
    </div>
  </div>
</body>
</html>`);
});

// Endpoint temporal para correr el schema en producción
// Protegido con BOT_INTERNAL_SECRET
app.get("/admin/run-schema", async (_req, res) => {
  const secret = _req.query.secret as string;
  if (secret !== process.env.BOT_INTERNAL_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { default: pool } = await import("./db/pool.js");
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    const schemas = [
      "/app/db/schema.sql",
      "/app/db/pricing_schema.sql",
    ];

    const results: string[] = [];
    for (const file of schemas) {
      if (!fs.existsSync(file)) { results.push(`⚠️ No encontrado: ${file}`); continue; }
      const sql = fs.readFileSync(file, "utf8");
      await pool.query(sql);
      results.push(`✅ ${path.basename(file)} aplicado`);
    }

    return res.json({ ok: true, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

app.use("/api/suscripciones", suscripcionesRouter);
app.use("/api/cashback", cashbackRouter);
app.use("/api/etherfuse", etherfuseRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/lidia", lidiaRouter);
app.use("/", lidiaBlinkRouter);
app.use("/", blinksRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

export { app };
