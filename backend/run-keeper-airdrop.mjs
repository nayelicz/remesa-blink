#!/usr/bin/env node
/**
 * Muestra la dirección del keeper para solicitar airdrop.
 * Uso: npm run keeper:airdrop
 * Luego: solana airdrop 2 <DIRECCION> --url devnet
 */
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const key = process.env.KEEPER_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
if (!key) {
  console.error("Error: KEEPER_PRIVATE_KEY o SOLANA_PRIVATE_KEY no definida en .env");
  process.exit(1);
}

try {
  const keypair = Keypair.fromSecretKey(bs58.decode(key));
  const addr = keypair.publicKey.toBase58();
  console.log("Dirección del keeper:", addr);
  console.log("Solicita airdrop: solana airdrop 2", addr, "--url devnet");
} catch (e) {
  try {
    const arr = JSON.parse(key);
    const keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
    const addr = keypair.publicKey.toBase58();
    console.log("Dirección del keeper:", addr);
    console.log("Solicita airdrop: solana airdrop 2", addr, "--url devnet");
  } catch (e2) {
    console.error("Error: clave inválida (base58 o JSON array esperado)");
    process.exit(1);
  }
}
