/**
 * Rutas Blinks - montadas en el mismo servidor que el backend
 */
import { Router } from "express";
import pool from "../db/pool.js";
import { createQuote, createOrder } from "../services/etherfuse.js";
import { getOnboardingPresignedUrl, AlreadyOnboardedError } from "./etherfuse.js";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

const router = Router();
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || (SOLANA_RPC.includes("devnet") ? USDC_DEVNET : USDC_MAINNET)
);

function getBaseUrl(): string {
  return process.env.BLINKS_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
}

router.get("/actions.json", (_req, res) => {
  const base = getBaseUrl();
  res.json({
    actions: [
      { url: `${base}/api/actions/enviar-remesa`, label: "Enviar Remesa SOL", description: "Transferir SOL a una wallet de destino" },
      { url: `${base}/api/actions/enviar-remesa-usdc`, label: "Enviar Remesa USDC", description: "Transferir USDC a una wallet de destino" },
      { url: `${base}/api/actions/convertir-mxn`, label: "Convertir USDC a MXN", description: "Off-ramp USDC a pesos via Etherfuse (SPEI)" },
      { url: `${base}/api/actions/onboarding-mxn`, label: "Completar Onboarding MXN", description: "KYC + CLABE para convertir USDC a pesos en tu banco" },
    ],
  });
});

router.get("/api/actions/enviar-remesa", (_req, res) => {
  const base = getBaseUrl();
  res.json({
    type: "action",
    title: "Remesa Blink",
    icon: "https://solana.com/favicon.ico",
    description: "Transferir SOL a una wallet de destino",
    label: "Enviar Remesa SOL",
    links: {
      actions: [{
        label: "Enviar",
        href: `${base}/api/actions/enviar-remesa`,
        parameters: [
          { name: "account", label: "Tu wallet", required: true, type: "text" },
          { name: "amount", label: "Monto (SOL)", required: true, type: "number" },
          { name: "destination", label: "Wallet destino", required: true, type: "text" },
        ],
      }],
    },
  });
});

router.get("/api/actions/enviar-remesa-usdc", (_req, res) => {
  const base = getBaseUrl();
  res.json({
    type: "action",
    title: "Remesa Blink USDC",
    icon: "https://solana.com/favicon.ico",
    description: "Transferir USDC a una wallet de destino",
    label: "Enviar Remesa USDC",
    links: {
      actions: [{
        label: "Enviar",
        href: `${base}/api/actions/enviar-remesa-usdc`,
        parameters: [
          { name: "account", label: "Tu wallet", required: true, type: "text" },
          { name: "amount", label: "Monto (USDC)", required: true, type: "number" },
          { name: "destination", label: "Wallet destino", required: true, type: "text" },
        ],
      }],
    },
  });
});

router.post("/api/actions/enviar-remesa", async (req, res) => {
  try {
    const { account, amount, destination } = req.body;
    if (!account || !amount || !destination) {
      return res.status(400).json({ message: "account, amount y destination son requeridos" });
    }
    const fromPubkey = new PublicKey(account);
    const toPubkey = new PublicKey(destination);
    const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
    if (lamports <= 0) return res.status(400).json({ message: "Monto debe ser positivo" });

    const connection = new Connection(RPC_URL);
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    const base64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    res.json({ transaction: base64, message: `Transferir ${amount} SOL a ${destination}` });
  } catch (err) {
    console.error("Error enviar-remesa:", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Error al crear transacción" });
  }
});

router.post("/api/actions/enviar-remesa-usdc", async (req, res) => {
  try {
    const { account, amount, destination } = req.body;
    if (!account || !amount || !destination) {
      return res.status(400).json({ message: "account, amount y destination son requeridos" });
    }
    const fromPubkey = new PublicKey(account);
    const toPubkey = new PublicKey(destination);
    const amountRaw = BigInt(Math.round(parseFloat(amount) * 1e6));
    if (amountRaw <= 0n) return res.status(400).json({ message: "Monto debe ser positivo" });

    const connection = new Connection(RPC_URL);
    const fromAta = getAssociatedTokenAddressSync(USDC_MINT, fromPubkey);
    const toAta = getAssociatedTokenAddressSync(USDC_MINT, toPubkey);
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(fromPubkey, toAta, toPubkey, USDC_MINT);
    const transferIx = createTransferInstruction(fromAta, toAta, fromPubkey, amountRaw, [], TOKEN_PROGRAM_ID);
    const tx = new Transaction().add(createAtaIx, transferIx);

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    const base64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    res.json({ transaction: base64, message: `Transferir ${amount} USDC a ${destination}` });
  } catch (err) {
    console.error("Error enviar-remesa-usdc:", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Error al crear transacción" });
  }
});

// --- Onboarding MXN (KYC + CLABE para Etherfuse) ---

router.get("/api/actions/onboarding-mxn", (_req, res) => {
  const base = getBaseUrl();
  res.json({
    type: "action",
    title: "Completar Onboarding MXN",
    icon: "https://solana.com/favicon.ico",
    description: "Registra KYC y CLABE para convertir USDC a pesos via SPEI",
    label: "Completar Onboarding MXN",
    links: {
      actions: [{
        label: "Obtener enlace",
        href: `${base}/api/actions/onboarding-mxn`,
        parameters: [
          { name: "account", label: "Tu wallet", required: true, type: "text" },
        ],
      }],
    },
  });
});

router.post("/api/actions/onboarding-mxn", async (req, res) => {
  try {
    const { account } = req.body;
    if (!account) {
      return res.status(400).json({ message: "account (wallet) requerido" });
    }
    const { presignedUrl } = await getOnboardingPresignedUrl(account, null);
    res.json({
      link: presignedUrl,
      message: "Abre el enlace para completar KYC y registrar tu CLABE. Válido 15 min.",
    });
  } catch (err) {
    if (err instanceof AlreadyOnboardedError) {
      return res.status(409).json({
        message: "El destinatario ya está registrado en Etherfuse.",
        code: "ALREADY_ONBOARDED",
      });
    }
    console.error("Error onboarding-mxn:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Error al obtener enlace",
    });
  }
});

// --- Convertir USDC a MXN (Etherfuse off-ramp) ---

router.get("/api/actions/convertir-mxn", (_req, res) => {
  const base = getBaseUrl();
  res.json({
    type: "action",
    title: "Convertir USDC a MXN",
    icon: "https://solana.com/favicon.ico",
    description: "Convertir USDC a pesos mexicanos via SPEI (Etherfuse)",
    label: "Convertir USDC a MXN",
    links: {
      actions: [{
        label: "Convertir",
        href: `${base}/api/actions/convertir-mxn`,
        parameters: [
          { name: "account", label: "Tu wallet (con USDC)", required: true, type: "text" },
          { name: "amount", label: "Monto USDC", required: true, type: "number" },
        ],
      }],
    },
  });
});

router.post("/api/actions/convertir-mxn", async (req, res) => {
  try {
    const { account, amount } = req.body;
    const amountQuery = req.query.amount as string | undefined;
    const amt = amount ?? amountQuery;
    if (!account || !amt) {
      return res.status(400).json({ message: "account y amount son requeridos" });
    }
    const sourceAmount = String(Math.round(parseFloat(amt) * 1e6) / 1e6);
    if (parseFloat(sourceAmount) <= 0) {
      return res.status(400).json({ message: "Monto debe ser positivo" });
    }

    const row = await pool.query(
      `SELECT etherfuse_customer_id, etherfuse_bank_account_id, kyc_status
       FROM beneficiarios_etherfuse WHERE destinatario_solana = $1`,
      [account]
    );
    if (!row.rows[0]) {
      return res.status(400).json({
        message: "Onboarding requerido. Completa KYC y CLABE en /api/etherfuse/onboarding-url",
      });
    }
    const { etherfuse_customer_id, etherfuse_bank_account_id, kyc_status } = row.rows[0];
    if (kyc_status !== "verified") {
      return res.status(400).json({
        message: "KYC pendiente o rechazado. Estado: " + kyc_status,
      });
    }

    const quote = await createQuote(etherfuse_customer_id, sourceAmount);
    const { burnTransaction, statusPage } = await createOrder(
      quote.quoteId,
      etherfuse_bank_account_id,
      account
    );

    res.json({
      transaction: burnTransaction,
      message: `${amt} USDC → MXN en tu banco via SPEI. ${statusPage ? `Estado: ${statusPage}` : ""}`,
    });
  } catch (err) {
    console.error("Error convertir-mxn:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Error al crear orden de conversión",
    });
  }
});

export default router;
