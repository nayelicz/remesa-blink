-- Schema PostgreSQL: Remesa Blink - Remesas Recurrentes
-- Ejecutar: psql $DATABASE_URL -f db/schema.sql

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla: suscripciones
-- Almacena las remesas recurrentes (on-chain + off-chain)
CREATE TABLE IF NOT EXISTS suscripciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remitente_wa VARCHAR(50) NOT NULL,
    destinatario_wa VARCHAR(50) NOT NULL,
    destinatario_solana VARCHAR(44),
    monto BIGINT NOT NULL CHECK (monto > 0),
    frecuencia VARCHAR(20) NOT NULL CHECK (frecuencia IN ('diario', 'semanal', 'mensual')),
    tipo_activo VARCHAR(10) NOT NULL DEFAULT 'SOL' CHECK (tipo_activo IN ('SOL', 'USDC')),
    proximo_pago TIMESTAMPTZ NOT NULL,
    ultimo_pago TIMESTAMPTZ,
    pda_address VARCHAR(44),
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración: añadir tipo_activo si no existe (DBs existentes)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'suscripciones' AND column_name = 'tipo_activo'
    ) THEN
        ALTER TABLE suscripciones ADD COLUMN tipo_activo VARCHAR(10) NOT NULL DEFAULT 'SOL' CHECK (tipo_activo IN ('SOL', 'USDC'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suscripciones_remitente_activa ON suscripciones(remitente_wa, activa);
CREATE INDEX IF NOT EXISTS idx_suscripciones_destinatario ON suscripciones(destinatario_wa, activa);
CREATE INDEX IF NOT EXISTS idx_suscripciones_proximo_pago ON suscripciones(proximo_pago) WHERE activa = true;

-- Tabla: cashback_programa
-- Configuración del programa de cashback (porcentajes por nivel)
CREATE TABLE IF NOT EXISTS cashback_programa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    porcentaje_nivel1 DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    porcentaje_nivel2 DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar configuración por defecto
INSERT INTO cashback_programa (porcentaje_nivel1, porcentaje_nivel2)
SELECT 1.0, 0.5
WHERE NOT EXISTS (SELECT 1 FROM cashback_programa LIMIT 1);

-- Tabla: cashback_transacciones
-- Registro de cada transacción que genera cashback
CREATE TABLE IF NOT EXISTS cashback_transacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_wa VARCHAR(50) NOT NULL,
    monto DECIMAL(18,6) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('remesa', 'referido')),
    suscripcion_id UUID REFERENCES suscripciones(id),
    referido_wa VARCHAR(50),
    nivel INTEGER CHECK (nivel IN (1, 2)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashback_transacciones_usuario ON cashback_transacciones(usuario_wa);
CREATE INDEX IF NOT EXISTS idx_cashback_transacciones_created ON cashback_transacciones(usuario_wa, created_at DESC);

-- Tabla: cashback_referidos
-- Relación referidor -> referido con código único
CREATE TABLE IF NOT EXISTS cashback_referidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referidor_wa VARCHAR(50) NOT NULL,
    referido_wa VARCHAR(50) NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(referidor_wa, referido_wa)
);

CREATE INDEX IF NOT EXISTS idx_cashback_referidos_codigo ON cashback_referidos(codigo) WHERE referidor_wa = referido_wa;
CREATE INDEX IF NOT EXISTS idx_cashback_referidos_referidor ON cashback_referidos(referidor_wa);

-- Tabla: blinks_pendientes
-- Blinks generados para notificar a destinatarios
CREATE TABLE IF NOT EXISTS blinks_pendientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suscripcion_id UUID REFERENCES suscripciones(id),
    tx_signature VARCHAR(88),
    destinatario_wa VARCHAR(50) NOT NULL,
    monto BIGINT NOT NULL,
    url_blink TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'reclamado', 'expirado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blinks_pendientes_suscripcion ON blinks_pendientes(suscripcion_id);
CREATE INDEX IF NOT EXISTS idx_blinks_pendientes_estado ON blinks_pendientes(estado);

-- Trigger para updated_at en suscripciones
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_suscripciones_updated_at ON suscripciones;
CREATE TRIGGER trg_suscripciones_updated_at
    BEFORE UPDATE ON suscripciones
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
