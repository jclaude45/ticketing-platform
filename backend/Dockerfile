# =============================================================================
# Stage 1: Builder — compiles TypeScript, generates Prisma client
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate && npm run build && npx tsc -p tsconfig.scripts.json

# =============================================================================
# Stage 2: Production deps — installs only prod deps with build tools,
#           kept as a separate stage so the final image stays clean
# =============================================================================
FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev --ignore-scripts && \
    npx prisma generate && \
    npm cache clean --force

# =============================================================================
# Stage 3: Development
# =============================================================================
FROM node:20-alpine AS development

WORKDIR /app

RUN apk add --no-cache python3 make g++ curl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

RUN npx prisma generate

COPY . .

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

RUN mkdir -p /app/keys && chown nestjs:nodejs /app/keys

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

CMD ["npm", "run", "start:dev"]

# =============================================================================
# Stage 4: Production — no build tools, minimal attack surface
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache curl dumb-init openssl

COPY package*.json ./
COPY prisma ./prisma/

# Pull pre-built deps and compiled output from earlier stages
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

RUN mkdir -p /app/keys && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
