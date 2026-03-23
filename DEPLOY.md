# Deploy Remesa Blink (MVP Hackathon)

## Opción 1: Railway (recomendado - ~2 min)

1. **Conectar repo**
   - [railway.app](https://railway.app) → New Project → Deploy from GitHub
   - Selecciona `remesa-blink`

2. **Variables de entorno** (Settings → Variables)
   ```
   PORT=3000
   BASE_URL=https://<tu-app>.railway.app
   BLINKS_BASE_URL=https://<tu-app>.railway.app
   DATABASE_URL=postgresql://...
   SOLANA_RPC_URL=https://api.devnet.solana.com
   KEEPER_PRIVATE_KEY=<base58>
   PROGRAM_ID=B1G72CcRGHYc1UpG4o51VrJySLiwm3d7tCHbQiSb5vZ2
   RUN_KEEPER=true
   ```

3. **Root directory**: `backend` NO — usa la raíz (Dockerfile está en raíz)
   - O si Railway no usa Docker por defecto: Root = `.` y usa el Dockerfile

4. **Deploy** → Genera URL pública

---

## Opción 2: Render

1. [render.com](https://render.com) → New → Web Service
2. Conecta repo, selecciona `remesa-blink`
3. Build: Docker (detecta Dockerfile)
4. Env vars: igual que arriba
5. Deploy

---

## Opción 3: Fly.io

```bash
cd remesa-blink
fly launch  # crea app
fly secrets set DATABASE_URL=... KEEPER_PRIVATE_KEY=... 
fly deploy
```

---

## Post-deploy

1. **Airdrop keeper (devnet)**
   ```bash
   npm run keeper:airdrop  # obtén dirección
   solana airdrop 2 <DIR> --url devnet
   ```

2. **Crear ATA USDC keeper**
   ```bash
   npm run keeper:usdc-ata
   ```
   Luego fondear desde https://faucet.circle.com

3. **Verificar**
   - `https://<tu-url>/health`
   - `https://<tu-url>/actions.json`
   - `https://<tu-url>/api/actions/enviar-remesa` (GET = metadata Blink)

---

## BLINKS_BASE_URL

Debe ser la URL pública del deploy (ej. `https://remesa-blink.onrender.com`).
Los Blinks usan esta URL para que wallets encuentren las acciones.

## Etherfuse (off-ramp USDC -> MXN)

```
ETHERFUSE_API_KEY=<api_key>
ETHERFUSE_API_URL=https://api.sand.etherfuse.com   # prod: https://api.etherfuse.com
ETHERFUSE_WEBHOOK_SECRET=<webhook_secret>
```

Registrar webhook: `POST /api/webhooks/etherfuse` en el dashboard Etherfuse.
