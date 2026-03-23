/**
 * Servidor Blinks - Remesa Blink
 * Endpoint de acción: enviar-remesa
 */
import "dotenv/config";
import express from "express";
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

const app = express();
const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

app.use(express.json());

// CORS para Blinks (spec: ACTIONS_CORS_HEADERS)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding"
  );
  next();
});

app.options("*", (_req, res) => res.sendStatus(204));

const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || (SOLANA_RPC.includes("devnet") ? USDC_DEVNET : USDC_MAINNET)
);

// actions.json para descubrimiento
app.get("/actions.json", (_req, res) => {
  const base = process.env.BLINKS_BASE_URL || `http://localhost:${PORT}`;
  res.json({
    actions: [
      {
        url: `${base}/api/actions/enviar-remesa`,
        label: "Enviar Remesa SOL",
        description: "Transferir SOL a una wallet de destino",
      },
      {
        url: `${base}/api/actions/enviar-remesa-usdc`,
        label: "Enviar Remesa USDC",
        description: "Transferir USDC a una wallet de destino",
      },
    ],
  });
});

/**
 * GET: Metadatos del Blink (ActionGetResponse)
 */
app.get("/api/actions/enviar-remesa", (_req, res) => {
  const base = process.env.BLINKS_BASE_URL || `http://localhost:${PORT}`;
  res.json({
    type: "action",
    title: "Remesa Blink",
    icon: "https://solana.com/favicon.ico",
    description: "Transferir SOL a una wallet de destino",
    label: "Enviar Remesa SOL",
    links: {
      actions: [
        {
          label: "Enviar",
          href: `${base}/api/actions/enviar-remesa`,
          parameters: [
            { name: "account", label: "Tu wallet", required: true, type: "text" },
            { name: "amount", label: "Monto (SOL)", required: true, type: "number" },
            { name: "destination", label: "Wallet destino", required: true, type: "text" },
          ],
        },
      ],
    },
  });
});

/**
 * GET: Metadatos del Blink USDC
 */
app.get("/api/actions/enviar-remesa-usdc", (_req, res) => {
  const base = process.env.BLINKS_BASE_URL || `http://localhost:${PORT}`;
  res.json({
    type: "action",
    title: "Remesa Blink USDC",
    icon: "https://solana.com/favicon.ico",
    description: "Transferir USDC a una wallet de destino",
    label: "Enviar Remesa USDC",
    links: {
      actions: [
        {
          label: "Enviar",
          href: `${base}/api/actions/enviar-remesa-usdc`,
          parameters: [
            { name: "account", label: "Tu wallet", required: true, type: "text" },
            { name: "amount", label: "Monto (USDC)", required: true, type: "number" },
            { name: "destination", label: "Wallet destino", required: true, type: "text" },
          ],
        },
      ],
    },
  });
});

/**
 * POST: Construye y devuelve la transacción firmable
 */
app.post("/api/actions/enviar-remesa", async (req, res) => {
  try {
    const { account, amount, destination } = req.body;

    if (!account || !amount || !destination) {
      return res.status(400).json({
        message: "account, amount y destination son requeridos",
      });
    }

    const fromPubkey = new PublicKey(account);
    const toPubkey = new PublicKey(destination);
    const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);

    if (lamports <= 0) {
      return res.status(400).json({ message: "Monto debe ser positivo" });
    }

    const connection = new Connection(RPC_URL);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      })
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64 = serialized.toString("base64");

    res.json({
      transaction: base64,
      message: `Transferir ${amount} SOL a ${destination}`,
    });
  } catch (err) {
    console.error("Error enviar-remesa:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Error al crear transacción",
    });
  }
});

/**
 * POST: Transacción USDC (SPL Token)
 */
app.post("/api/actions/enviar-remesa-usdc", async (req, res) => {
  try {
    const { account, amount, destination } = req.body;

    if (!account || !amount || !destination) {
      return res.status(400).json({
        message: "account, amount y destination son requeridos",
      });
    }

    const fromPubkey = new PublicKey(account);
    const toPubkey = new PublicKey(destination);
    const amountRaw = BigInt(Math.round(parseFloat(amount) * 1e6)); // USDC 6 decimals

    if (amountRaw <= 0n) {
      return res.status(400).json({ message: "Monto debe ser positivo" });
    }

    const connection = new Connection(RPC_URL);
    const fromAta = getAssociatedTokenAddressSync(USDC_MINT, fromPubkey);
    const toAta = getAssociatedTokenAddressSync(USDC_MINT, toPubkey);

    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      fromPubkey,
      toAta,
      toPubkey,
      USDC_MINT
    );
    const transferIx = createTransferInstruction(
      fromAta,
      toAta,
      fromPubkey,
      amountRaw,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(createAtaIx, transferIx);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64 = serialized.toString("base64");

    res.json({
      transaction: base64,
      message: `Transferir ${amount} USDC a ${destination}`,
    });
  } catch (err) {
    console.error("Error enviar-remesa-usdc:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Error al crear transacción",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Blinks server en http://localhost:${PORT}`);
});
