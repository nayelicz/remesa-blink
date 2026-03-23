#!/usr/bin/env node
/**
 * Crea la cuenta ATA de USDC del keeper si no existe.
 * Requisito 1: El keeper debe tener USDC en su ATA.
 * Uso: npm run keeper:usdc-ata
 */
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const isDevnet = String(RPC).includes("devnet");
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || (isDevnet ? USDC_DEVNET : USDC_MAINNET)
);

function getKeeperKeypair() {
  const key = process.env.KEEPER_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
  if (!key) throw new Error("KEEPER_PRIVATE_KEY o SOLANA_PRIVATE_KEY no definida");
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)));
  }
}

async function main() {
  const connection = new Connection(RPC);
  const keeper = getKeeperKeypair();
  const ata = getAssociatedTokenAddressSync(USDC_MINT, keeper.publicKey);

  let exists = false;
  try {
    await getAccount(connection, ata);
    exists = true;
  } catch (_) {}

  if (exists) {
    console.log("ATA USDC del keeper ya existe:", ata.toBase58());
    return;
  }

  const ix = createAssociatedTokenAccountIdempotentInstruction(
    keeper.publicKey,
    ata,
    keeper.publicKey,
    USDC_MINT
  );
  const tx = new Transaction().add(ix);

  const sig = await sendAndConfirmTransaction(connection, tx, [keeper]);
  console.log("ATA USDC creada:", ata.toBase58());
  console.log("Tx:", sig);
  console.log("\nFondo USDC desde faucet devnet o transferencia.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
