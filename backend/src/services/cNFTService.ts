// ─────────────────────────────────────────────────────────
// cNFTService.ts  –  Mint de Tickets de Retiro como cNFT
// Usa Metaplex Bubblegum (compressed NFTs) en Solana devnet
// Mucho más barato que NFTs normales (~0.000005 SOL por mint)
// ─────────────────────────────────────────────────────────

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, generateSigner, percentAmount, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { createTree, mintToCollectionV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';

const RPC_URL      = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const KEEPER_KEY   = process.env.KEEPER_PRIVATE_KEY ?? '';
const TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS ?? ''; // se llena después del primer deploy

// ── Inicializar UMI con el keypair del keeper ─────────────────────────────────
function getUmi() {
  if (!KEEPER_KEY) throw new Error('KEEPER_PRIVATE_KEY no configurada');
  const secretKey = bs58.decode(KEEPER_KEY);
  const keypair   = Keypair.fromSecretKey(secretKey);
  const umi = createUmi(RPC_URL)
    .use(mplBubblegum())
    .use(mplTokenMetadata())
    .use(keypairIdentity({
      publicKey:  umiPublicKey(keypair.publicKey.toBase58()),
      secretKey:  keypair.secretKey,
    }));
  return { umi, keypair };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface TicketMetadata {
  ticketCode:   string;
  userWA:       string;
  walletSolana: string;
  amountUSDC:   number;
  storeName:    string;
  windowStart:  Date;
  cashbackUSDC: number;
}

export interface MintResult {
  signature: string;
  leafIndex:  number;
  treeAddress: string;
  metadataUri: string;
}

// ── Crear Merkle Tree (solo una vez en deploy) ────────────────────────────────
// Llama esta función UNA sola vez y guarda el address en MERKLE_TREE_ADDRESS
export async function createMerkleTree(): Promise<string> {
  const { umi } = getUmi();
  const treeKeypair = generateSigner(umi);

  await createTree(umi, {
    merkleTree: treeKeypair,
    maxDepth:   14,   // hasta 16,384 NFTs
    maxBufferSize: 64,
  }).sendAndConfirm(umi);

  console.log('[cNFT] Merkle Tree creado:', treeKeypair.publicKey);
  console.log('[cNFT] Agrega a .env: MERKLE_TREE_ADDRESS=' + treeKeypair.publicKey);
  return treeKeypair.publicKey.toString();
}

// ── Construir metadata URI del ticket (JSON on-chain simulado) ────────────────
// En producción: subir a Arweave/IPFS con Metaplex UMI + irys
function buildMetadataUri(ticket: TicketMetadata): string {
  // Para el hackathon: usamos un data URI con el JSON del ticket
  // En producción reemplazar con upload a Arweave via umi.uploader
  const metadata = {
    name:        `Ticket Retiro #${ticket.ticketCode}`,
    symbol:      'RBLINK',
    description: `Ticket de retiro programado — Remesa Blink. Válido en ${ticket.storeName}.`,
    image:       'https://remesa-blink.vercel.app/ticket-nft.png', // reemplazar con imagen real
    attributes: [
      { trait_type: 'Ticket Code',    value: ticket.ticketCode },
      { trait_type: 'Amount USDC',    value: ticket.amountUSDC.toString() },
      { trait_type: 'Store',          value: ticket.storeName },
      { trait_type: 'Window Start',   value: ticket.windowStart.toISOString() },
      { trait_type: 'Cashback USDC',  value: ticket.cashbackUSDC.toString() },
      { trait_type: 'User WA',        value: ticket.userWA },
    ],
    properties: {
      category: 'withdrawal_ticket',
      created:  new Date().toISOString(),
    },
  };
  // Base64 data URI — funciona para hackathon sin subir a IPFS
  const json = JSON.stringify(metadata);
  return `data:application/json;base64,${Buffer.from(json).toString('base64')}`;
}

// ── Mint del cNFT ticket ──────────────────────────────────────────────────────
export async function mintWithdrawalTicket(ticket: TicketMetadata): Promise<MintResult> {
  if (!TREE_ADDRESS) {
    throw new Error(
      'MERKLE_TREE_ADDRESS no configurado. Ejecuta createMerkleTree() primero y guarda el address en .env'
    );
  }

  const { umi } = getUmi();
  const metadataUri = buildMetadataUri(ticket);

  const { signature, result } = await mintToCollectionV1(umi, {
    leafOwner:    umiPublicKey(ticket.walletSolana),
    merkleTree:   umiPublicKey(TREE_ADDRESS),
    metadata: {
      name:                 `Ticket #${ticket.ticketCode}`,
      uri:                  metadataUri,
      sellerFeeBasisPoints: percentAmount(0),  // 0% royalty
      collection:           { key: umiPublicKey(TREE_ADDRESS), verified: false },
      creators: [],
    },
  }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  // Extraer leaf index del resultado
  const leafIndex = (result.value as { leafIndex?: number })?.leafIndex ?? 0;

  console.log(`[cNFT] Ticket ${ticket.ticketCode} minteado → tx: ${Buffer.from(signature).toString('hex').slice(0, 16)}...`);

  return {
    signature:   Buffer.from(signature).toString('hex'),
    leafIndex,
    treeAddress: TREE_ADDRESS,
    metadataUri,
  };
}

// ── Fallback: mint simulado para demo sin Merkle Tree configurado ─────────────
export async function mintWithdrawalTicketMock(ticket: TicketMetadata): Promise<MintResult> {
  console.log(`[cNFT MOCK] Simulando mint para ticket ${ticket.ticketCode}`);
  await new Promise(r => setTimeout(r, 500)); // simular latencia de red
  return {
    signature:   `mock_${ticket.ticketCode}_${Date.now().toString(36)}`,
    leafIndex:   Math.floor(Math.random() * 1000),
    treeAddress: TREE_ADDRESS || 'MOCK_TREE_ADDRESS',
    metadataUri: buildMetadataUri(ticket),
  };
}

// ── Función principal: intenta real, cae a mock si falla ─────────────────────
export async function mintTicket(ticket: TicketMetadata): Promise<MintResult> {
  if (!TREE_ADDRESS || !KEEPER_KEY) {
    return mintWithdrawalTicketMock(ticket);
  }
  try {
    return await mintWithdrawalTicket(ticket);
  } catch (err) {
    console.warn('[cNFT] Mint real falló, usando mock:', (err as Error).message);
    return mintWithdrawalTicketMock(ticket);
  }
}
