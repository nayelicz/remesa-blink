/**
 * Rutas de suscripciones
 */
import { Router } from "express";
import {
  crearSuscripcion,
  listarSuscripcionesPorUsuario,
} from "../services/suscripciones.js";
import { z } from "zod";

const router = Router();

const crearSchema = z.object({
  remitente_wa: z.string().min(1),
  destinatario_wa: z.string().min(1),
  destinatario_solana: z.string().min(32).max(44),
  monto: z.number().positive(),
  frecuencia: z.enum(["diario", "semanal", "mensual"]),
  tipo_activo: z.enum(["SOL", "USDC"]).optional().default("SOL"),
});

router.post("/", async (req, res) => {
  try {
    const parsed = crearSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const suscripcion = await crearSuscripcion(parsed.data);
    res.status(201).json(suscripcion);
  } catch (err) {
    console.error("Error crear suscripcion:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Error al crear suscripcion",
    });
  }
});

router.get("/:wa", async (req, res) => {
  try {
    const wa = req.params.wa;
    const suscripciones = await listarSuscripcionesPorUsuario(wa);
    res.json(suscripciones);
  } catch (err) {
    console.error("Error listar suscripciones:", err);
    res.status(500).json({ error: "Error al listar suscripciones" });
  }
});

export default router;
