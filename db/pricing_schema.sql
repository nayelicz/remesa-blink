-- ─────────────────────────────────────────────────────────
-- pricing_schema.sql  –  Tablas del Dynamic Pricing Engine
-- Agregar al schema existente en db/schema.sql
-- ─────────────────────────────────────────────────────────

-- Historial de decisiones de pricing (auditoría + ML futuro)
CREATE TABLE IF NOT EXISTS pricing_decisions (
  id               SERIAL PRIMARY KEY,
  wallet_solana    TEXT        NOT NULL,
  user_wa          TEXT        NOT NULL,
  amount_usdc      NUMERIC(12,6) NOT NULL,
  zone             TEXT,
  time_slot_type   TEXT        NOT NULL CHECK (time_slot_type IN ('peak','valley','normal')),
  base_fee_usdc    NUMERIC(8,6) NOT NULL,
  adjusted_fee_usdc NUMERIC(8,6) NOT NULL,
  urgency_fee_usdc NUMERIC(8,6) NOT NULL DEFAULT 0,
  cashback_usdc    NUMERIC(8,6) NOT NULL DEFAULT 0,
  cashback_mxn     NUMERIC(10,2) NOT NULL DEFAULT 0,
  savings_vs_peak  NUMERIC(8,6) NOT NULL DEFAULT 0,
  lidia_script     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tickets de retiro programados (turno NFT / reserva)
CREATE TABLE IF NOT EXISTS withdrawal_tickets (
  id               SERIAL PRIMARY KEY,
  ticket_code      TEXT        UNIQUE NOT NULL,        -- código de reserva del aliado
  cnft_mint        TEXT,                               -- dirección del cNFT en Solana (post-mint)
  wallet_solana    TEXT        NOT NULL,
  user_wa          TEXT        NOT NULL,
  amount_usdc      NUMERIC(12,6) NOT NULL,
  store_id         TEXT        NOT NULL,
  store_name       TEXT        NOT NULL,
  zone             TEXT,
  source           TEXT        NOT NULL CHECK (source IN ('bitso','baz','spin','mock')),
  window_start     TIMESTAMPTZ NOT NULL,
  window_end       TIMESTAMPTZ NOT NULL,
  cashback_usdc    NUMERIC(8,6) NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','redeemed','expired','cancelled')),
  world_id_verified BOOLEAN    NOT NULL DEFAULT FALSE,
  redeemed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_tickets_wallet    ON withdrawal_tickets(wallet_solana);
CREATE INDEX IF NOT EXISTS idx_tickets_user_wa   ON withdrawal_tickets(user_wa);
CREATE INDEX IF NOT EXISTS idx_tickets_status    ON withdrawal_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_window    ON withdrawal_tickets(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_pricing_wallet    ON pricing_decisions(wallet_solana);
CREATE INDEX IF NOT EXISTS idx_pricing_created   ON pricing_decisions(created_at DESC);

-- Vista útil para el keeper: tickets activos próximos a vencer
CREATE OR REPLACE VIEW active_tickets AS
  SELECT * FROM withdrawal_tickets
  WHERE  status = 'pending'
    AND  expires_at > NOW()
  ORDER BY window_start ASC;
