/**
 * Rutas Blinks - montadas en el mismo servidor que el backend
 */
import { Router } from "express";
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

export default router;
