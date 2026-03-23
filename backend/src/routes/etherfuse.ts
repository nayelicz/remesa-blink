/**
 * Rutas Etherfuse - Onboarding y off-ramp
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import pool from "../db/pool.js";
import {
  createOnboardingUrl,
  getCustomerBankAccounts,
  parseOrgFrom409Error,
} from "../services/etherfuse.js";
import { z } from "zod";

const router = Router();

const onboardingSchema = z.object({
  destinatario_solana: z.string().min(32).max(44),
  destinatario_wa: z.string().min(1).optional(),
});

/** Error para 409 ya onboardeado */
export class AlreadyOnboardedError extends Error {
  code = "ALREADY_ONBOARDED";
}

/** Lógica compartida: obtener URL presignada de onboarding */
export async function getOnboardingPresignedUrl(
  destinatario_solana: string,
  destinatario_wa?: string | null
): Promise<{ presignedUrl: string }> {
  let customerId: string;
  let bankAccountId: string;

  const existing = await pool.query(
    `SELECT etherfuse_customer_id, etherfuse_bank_account_id
     FROM beneficiarios_etherfuse
     WHERE destinatario_solana = $1`,
    [destinatario_solana]
  );

  if (existing.rows.length > 0) {
    customerId = existing.rows[0].etherfuse_customer_id;
    bankAccountId = existing.rows[0].etherfuse_bank_account_id;
  } else {
    customerId = randomUUID();
    bankAccountId = randomUUID();
  }

  let presignedUrl: string;
  try {
    presignedUrl = await createOnboardingUrl(
      customerId,
      bankAccountId,
      destinatario_solana
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("409") && msg.includes("already added user")) {
      const orgId = parseOrgFrom409Error(err);
      if (orgId) {
        try {
          const bankAccounts = await getCustomerBankAccounts(orgId);
          const first = bankAccounts[0];
          if (first) {
            presignedUrl = await createOnboardingUrl(
              orgId,
              first.bankAccountId,
              destinatario_solana
            );
            customerId = orgId;
            bankAccountId = first.bankAccountId;
          } else {
            throw new AlreadyOnboardedError("No se encontró cuenta bancaria");
          }
        } catch (recoverErr) {
          if (recoverErr instanceof AlreadyOnboardedError) throw recoverErr;
          console.error("Error recuperando onboarding:", recoverErr);
          throw new AlreadyOnboardedError(
            "El wallet ya completó el onboarding. Si necesita actualizar datos o CLABE, contacte soporte."
          );
        }
      } else {
        throw new AlreadyOnboardedError(
          "El destinatario ya está registrado en Etherfuse."
        );
      }
    } else {
      throw err;
    }
  }

  await pool.query(
    `INSERT INTO beneficiarios_etherfuse (
      destinatario_solana, destinatario_wa,
      etherfuse_customer_id, etherfuse_bank_account_id, kyc_status
    ) VALUES ($1, $2, $3, $4, 'pending')
    ON CONFLICT (destinatario_solana) DO UPDATE SET
      etherfuse_customer_id = EXCLUDED.etherfuse_customer_id,
      etherfuse_bank_account_id = EXCLUDED.etherfuse_bank_account_id,
      destinatario_wa = COALESCE(EXCLUDED.destinatario_wa, beneficiarios_etherfuse.destinatario_wa),
      kyc_status = 'pending',
      updated_at = NOW()`,
    [destinatario_solana, destinatario_wa || null, customerId, bankAccountId]
  );

  return { presignedUrl };
}

/**
 * POST /api/etherfuse/onboarding-url
 * Genera URL presignada para KYC + CLABE
 */
router.post("/onboarding-url", async (req, res) => {
  try {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "destinatario_solana requerido (wallet Solana)",
        details: parsed.error.flatten(),
      });
    }
    const { destinatario_solana, destinatario_wa } = parsed.data;
    const result = await getOnboardingPresignedUrl(
      destinatario_solana,
      destinatario_wa || null
    );
    res.json(result);
  } catch (err) {
    if (err instanceof AlreadyOnboardedError) {
      return res.status(409).json({
        error: "El destinatario ya está registrado en Etherfuse.",
        code: "ALREADY_ONBOARDED",
        hint: err.message,
      });
    }
    console.error("Error onboarding-url:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Error al generar URL de onboarding",
    });
  }
});

export default router;
