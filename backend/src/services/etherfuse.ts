/**
 * Servicio Etherfuse - Off-ramp USDC → MXN
 * https://docs.etherfuse.com
 */
import { randomUUID } from "crypto";

const BASE_URL =
  process.env.ETHERFUSE_API_URL || "https://api.sand.etherfuse.com";
const API_KEY = process.env.ETHERFUSE_API_KEY || "";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_MINT = RPC_URL.includes("devnet") ? USDC_DEVNET : USDC_MAINNET;

interface QuoteResponse {
  quoteId: string;
  blockchain: string;
  sourceAmount: string;
  destinationAmount: string;
  exchangeRate: string;
  expiresAt: string;
}

interface OrderResponse {
  offramp?: {
    orderId: string;
    burnTransaction?: string;
    statusPage?: string;
  };
  onramp?: {
    orderId: string;
    depositClabe?: string;
    depositAmount?: number;
  };
}

interface OnboardingUrlResponse {
  presigned_url: string;
}

interface BankAccountItem {
  bankAccountId: string;
  customerId: string;
}

interface PagedBankAccounts {
  items: BankAccountItem[];
}

async function etherfuseFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_KEY) {
    throw new Error("ETHERFUSE_API_KEY no configurada");
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Etherfuse API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Crear quote para off-ramp USDC → MXN
 */
export async function createQuote(
  customerId: string,
  sourceAmount: string,
  sourceAsset: string = USDC_MINT
): Promise<QuoteResponse> {
  const quoteId = randomUUID();
  const body = {
    quoteId,
    customerId,
    blockchain: "solana",
    quoteAssets: {
      type: "offramp",
      sourceAsset,
      targetAsset: "MXN",
    },
    sourceAmount,
  };
  const resp = await etherfuseFetch<QuoteResponse>("/ramp/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { ...resp, quoteId };
}

/**
 * Crear order off-ramp. Devuelve burnTransaction para que el usuario firme.
 */
export async function createOrder(
  quoteId: string,
  bankAccountId: string,
  publicKey: string
): Promise<{ orderId: string; burnTransaction: string; statusPage?: string }> {
  const orderId = randomUUID();
  const body = {
    orderId,
    bankAccountId,
    publicKey,
    quoteId,
  };
  const resp = await etherfuseFetch<OrderResponse>("/ramp/order", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!resp.offramp) throw new Error("Respuesta inesperada de Etherfuse order");
  if (!resp.offramp.burnTransaction) {
    throw new Error("Etherfuse no devolvió burnTransaction");
  }
  return {
    orderId: resp.offramp.orderId,
    burnTransaction: resp.offramp.burnTransaction,
    statusPage: resp.offramp.statusPage,
  };
}

/**
 * Generar URL de onboarding (KYC + CLABE)
 */
export async function createOnboardingUrl(
  customerId: string,
  bankAccountId: string,
  publicKey: string
): Promise<string> {
  const body = {
    customerId,
    bankAccountId,
    publicKey,
    blockchain: "solana",
  };
  const resp = await etherfuseFetch<OnboardingUrlResponse>("/ramp/onboarding-url", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return resp.presigned_url;
}

/**
 * Obtener bank accounts de un customer (para recuperar de 409)
 */
export async function getCustomerBankAccounts(
  customerId: string
): Promise<{ bankAccountId: string }[]> {
  const resp = await etherfuseFetch<PagedBankAccounts>(
    `/ramp/customer/${customerId}/bank-accounts`
  );
  return (resp.items || []).map((item) => ({
    bankAccountId: item.bankAccountId,
  }));
}

/** Extrae org/customer_id del error 409 "see org: <uuid>" */
export function parseOrgFrom409Error(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/see org:\s*([a-f0-9-]{36})/i);
  return match ? match[1] : null;
}

export { USDC_MINT as ETHERFUSE_USDC_MINT };
