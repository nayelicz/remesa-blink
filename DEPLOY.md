# Deploy Remesa Blink en Render

## Pasos (15 minutos)

---

### 1. Crear cuenta en Render
Ve a https://render.com y regístrate con tu cuenta de GitHub.

---

### 2. Conectar el repositorio
1. Dashboard → **New** → **Blueprint**
2. Conecta tu cuenta de GitHub si no lo has hecho
3. Selecciona el repo **`remesa-blink`**
4. Render detecta automáticamente el `render.yaml` y crea los 3 servicios:
   - `remesa-blink-backend` (API + Keeper + LidIA)
   - `remesa-blink-bot` (WhatsApp Baileys)
   - `remesa-blink-db` (PostgreSQL)

---

### 3. Configurar variables secretas
Render no puede leer las vars marcadas como `sync: false` — debes pegarlas manualmente.

Ve a cada servicio → **Environment** y agrega:

#### remesa-blink-backend
| Variable | Valor |
|---|---|
| `KEEPER_PRIVATE_KEY` | Tu clave base58 del keeper |
| `ELEVENLABS_API_KEY` | Tu API key de ElevenLabs |
| `ETHERFUSE_API_KEY` | Tu API key de Etherfuse |
| `ETHERFUSE_WEBHOOK_SECRET` | Secret del webhook Etherfuse |
| `BOT_INTERNAL_SECRET` | Cualquier string secreto (ej: `remesa2025`) |
| `MERKLE_TREE_ADDRESS` | Dejar vacío por ahora (se llena después) |

#### remesa-blink-bot
| Variable | Valor |
|---|---|
| `BOT_INTERNAL_SECRET` | El mismo string que pusiste arriba |

---

### 4. Hacer el deploy
Clic en **Apply** — Render construye los 3 servicios en paralelo (~5 min).

---

### 5. Aplicar el schema de base de datos
Una vez que el backend esté live, abre la **Shell** del servicio backend en Render:

```bash
npm run db:schema
```

---

### 6. Fondear el keeper (Solana devnet)
En la Shell del backend:

```bash
npm run keeper:airdrop        # muestra la dirección
npm run keeper:usdc-ata       # crea ATA de USDC
```

Luego pide SOL en devnet: `solana airdrop 2 <DIR> --url devnet`
Y USDC en: https://faucet.circle.com

---

### 7. Crear Merkle Tree para cNFTs (opcional)
En la Shell del backend:

```bash
npx tsx -e "import { createMerkleTree } from './src/services/cNFTService.js'; createMerkleTree().then(a => console.log('MERKLE_TREE_ADDRESS=' + a));"
```

Copia el address → agrégalo como `MERKLE_TREE_ADDRESS` → Manual Deploy.

---

### 8. Conectar WhatsApp
1. Ve al servicio `remesa-blink-bot` → **Logs**
2. Escanea el QR con WhatsApp (Dispositivos vinculados → Vincular dispositivo)
3. La sesión queda en el disco persistente de Render

---

### 9. Configurar webhook Etherfuse
- URL: `https://remesa-blink-backend.onrender.com/api/webhooks/etherfuse`
- Eventos: `kyc_updated`, `customer_updated`, `order_updated`
- Dashboard: https://devnet.etherfuse.com → Webhooks

---

### 10. Verificar

```bash
curl https://remesa-blink-backend.onrender.com/health
curl https://remesa-blink-backend.onrender.com/api/pricing/current-slot
curl https://remesa-blink-backend.onrender.com/actions.json
```

---

## Variables completas (referencia)

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=B1G72CcRGHYc1UpG4o51VrJySLiwm3d7tCHbQiSb5vZ2
KEEPER_PRIVATE_KEY=<base58>
ELEVENLABS_API_KEY=<key>
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
LIDIA_USE_VOICE=true
MERKLE_TREE_ADDRESS=<address>
WORLD_ID_APP_ID=app_staging_remesa_blink
WORLD_ID_ACTION=retiro-efectivo
ETHERFUSE_API_KEY=<key>
ETHERFUSE_API_URL=https://api.sand.etherfuse.com
ETHERFUSE_WEBHOOK_SECRET=<secret>
BOT_INTERNAL_URL=https://remesa-blink-bot.onrender.com
BOT_INTERNAL_SECRET=<secreto>
```

---

## Troubleshooting

**Build falla con @metaplex-foundation** → El `package-lock.json` no incluye las nuevas deps. Corre `npm install` en `backend/` y commitea el lock file.

**Bot pierde sesión** → El disco persistente debe estar montado en `/app/bot/auth_info`. Verifica en Settings → Disks.

**LidIA no genera audio** → Verifica `ELEVENLABS_API_KEY`. Si está vacía, el sistema manda texto automáticamente (fallback).

**db:schema falla** → La DB tarda ~2 min en estar lista después del primer deploy. Espera y reintenta.
