/**
 * App Express - Backend + Blinks
 * Exportado para tests; index.ts importa y escucha.
 */
import "dotenv/config";
import express from "express";
import { actionCorsMiddleware } from "@solana/actions";
import suscripcionesRouter from "./routes/suscripciones.js";
import cashbackRouter from "./routes/cashback.js";
import etherfuseRouter from "./routes/etherfuse.js";
import webhooksRouter from "./routes/webhooks.js";
import blinksRouter from "./routes/blinks.js";
import pricingRouter from "./pricing/pricingRoutes.js";
import lidiaRouter from "./routes/lidia.js";

const app = express();
app.use(express.json());

app.use(actionCorsMiddleware({ actionVersion: 1 }));
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
