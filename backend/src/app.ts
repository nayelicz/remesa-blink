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
      path.join(__dirname, "../../db/schema.sql"),
      path.join(__dirname, "../../db/pricing_schema.sql"),
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
app.use("/", blinksRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

export { app };
