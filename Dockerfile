# Remesa Blink - Backend + Blinks + Keeper + LidIA
FROM node:20-alpine

# Dependencias nativas para módulos como bn.js y canvas
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY backend/package*.json backend/
# Instalamos TODAS las deps (no --omit=dev) porque tsx es devDependency
RUN cd backend && npm ci

COPY backend/ backend/
COPY anchor/ anchor/
COPY db/ db/

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
