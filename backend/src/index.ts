/**
 * Backend API + Blinks - Remesa Blink
 * Un solo servidor: suscripciones, cashback, Blinks
 */
import "dotenv/config";
import express from "express";
import suscripcionesRouter from "./routes/suscripciones.js";
import cashbackRouter from "./routes/cashback.js";
import blinksRouter from "./routes/blinks.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS para Blinks (spec ACTIONS_CORS_HEADERS)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Encoding, Accept-Encoding");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/suscripciones", suscripcionesRouter);
app.use("/api/cashback", cashbackRouter);
app.use("/", blinksRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`Backend+Blinks en http://localhost:${PORT}`);
  if (process.env.RUN_KEEPER === "true") {
    import("./keeper/cron.js").then(() => console.log("Keeper iniciado (integrado)"));
  }
});
