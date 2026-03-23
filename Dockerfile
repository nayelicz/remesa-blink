# Remesa Blink - Backend + Blinks + Keeper
FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ backend/
COPY anchor/ anchor/

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

# tsx para ejecutar TypeScript directamente (sin build)
CMD ["npx", "tsx", "src/index.ts"]
