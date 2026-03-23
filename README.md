# Remesa Blink - Sistema de Remesas Recurrentes

Sistema de remesas recurrentes con programa Anchor en Solana, backend Express, bot WhatsApp (Baileys), Blinks y keeper cron.

## Estructura

```
remesa-blink/
├── anchor/remesas_recurrentes/   # Programa Anchor
├── backend/                      # API Express + Keeper
├── bot/                          # Bot WhatsApp (Baileys)
├── blinks/                       # Servidor Blinks
├── db/                           # Schema PostgreSQL
└── README.md
```

## Requisitos

- Node.js 18+
- PostgreSQL
- Solana CLI (Anchor)
- Rust

## 1. Programa Anchor

```bash
cd anchor/remesas_recurrentes
yarn install
anchor build
anchor deploy --provider.cluster devnet
```

Anota el `PROGRAM_ID` (en Anchor.toml) para el backend.

## 2. Base de datos

**Opción A - Docker** (si tienes Docker instalado):
```bash
docker compose up -d
sleep 5 && npm run db:schema
```

**Opción B - PostgreSQL local**:
```bash
sudo apt install postgresql postgresql-client
sudo service postgresql start
sudo -u postgres createdb remesa_blink
# Ajusta user/pass en backend/.env para tu usuario PostgreSQL
npm run db:schema
```

**Opción C - Neon/Supabase** (gratis, sin instalar):
1. Crea cuenta en [neon.tech](https://neon.tech) o [supabase.com](https://supabase.com)
2. Crea un proyecto y copia la connection string
3. Ponla en `backend/.env` como `DATABASE_URL`
4. `npm run db:schema` (desde la raíz del proyecto)

## 3. Variables de entorno

Copia los `.env.example` en cada módulo y configura:

**backend/.env**
- `DATABASE_URL`: PostgreSQL
- `SOLANA_RPC_URL`: https://api.devnet.solana.com
- `PROGRAM_ID`: ID del programa Anchor
- `KEEPER_PRIVATE_KEY`: Clave base58 del keeper (wallet que ejecuta pagos)

**bot/.env**
- `API_BASE_URL`: http://localhost:3000

**blinks/.env**
- `PORT`: 3001
- `BLINKS_BASE_URL`: URL pública del servidor Blinks

## 4. Faucet (SOL de prueba)

```bash
solana airdrop 2 <KEEPER_ADDRESS> --url devnet
```

## 5. Ejecutar servicios

En terminales separadas:

```bash
# Backend API
cd backend && npm install && npm run dev

# Keeper (cron cada hora)
cd backend && npm run keeper

# Bot WhatsApp
cd bot && npm install && npm run start

# Blinks
cd blinks && npm install && npm run start
```

## 6. Flujo de prueba

1. **Registrar suscripción SOL**: `/recurrente 0.01 diario 521234567890 F3bBUduLLoLFxCpEmPuQXvHwM2yshiHFuTvAcGJ4ANm3`
2. **Registrar suscripción USDC**: `/recurrente 10 USDC diario 521234567890 F3bBUduLLoLFxCpEmPuQXvHwM2yshiHFuTvAcGJ4ANm3`
3. **Ver suscripciones**: `/mis-remesas`
4. **Cashback**: `/cashback`, `/generar-codigo`
5. **Blinks**: `enviar-remesa` (SOL) y `enviar-remesa-usdc` (USDC)

## Comandos del bot

| Comando | Descripción |
|---------|-------------|
| /start, /ayuda | Mensaje de bienvenida |
| /recurrente [monto] [SOL\|USDC] [frecuencia] [destinatario_wa] [wallet_solana] | Registrar remesa recurrente (SOL por defecto) |
| /mis-remesas | Listar suscripciones activas |
| /cashback, /mis-recompensas | Ver saldo cashback |
| /generar-codigo | Generar código de referido |
| /canjear [monto] | Canjear cashback |
| /soporte | Contactar soporte |

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/suscripciones | Registrar suscripción |
| GET | /api/suscripciones/:wa | Listar suscripciones |
| POST | /api/cashback/generar-codigo | Generar código referido |
| POST | /api/cashback/registrar-referido | Registrar referido |
| GET | /api/cashback/:wa | Resumen cashback |
| POST | /api/cashback/canjear | Canjear cashback |

## Cronograma de implementación (7 días)

| Día | Tareas |
|-----|--------|
| 1 | Programa Anchor, deploy devnet |
| 2 | Schema PostgreSQL, backend DB |
| 3 | Endpoints suscripciones y cashback |
| 4 | Keeper cron |
| 5 | Bot Baileys |
| 6 | Blinks, pruebas E2E |
| 7 | README, ajustes |
