# Multi-stage build for NestJS API in monorepo
# Uses node:20-slim (Debian) for Prisma binary compatibility

FROM node:20-slim AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/

RUN npm ci

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client (requires schema + binaries)
RUN npx prisma generate --schema packages/database/prisma/schema.prisma

# Build NestJS
RUN npm run build -w apps/api

# --- Runner stage ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/

RUN npm ci --omit=dev

# Copy schema for potential Prisma runtime usage
COPY packages/database/prisma/ ./packages/database/prisma/

# Copy generated Prisma client from builder (platform-specific binary)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built app
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
