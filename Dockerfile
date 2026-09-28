# syntax=docker/dockerfile:1

# ---- deps ------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ---- build -----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma Client is generated from the schema; no database needed at build time.
RUN npx prisma generate && npx next build

# ---- tools -----------------------------------------------------------------
# Migrations, seeding and the operator scripts. Everything the Prisma CLI and
# tsx need, and nothing the web server produced: `builder` also carries a built
# .next, which this has no use for.
FROM node:24-alpine AS tools
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
RUN npx prisma generate
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV STORAGE_LOCAL_DIR=/app/var/uploads

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S yapped -G nodejs

# Next standalone output carries only the server and its runtime dependencies.
COPY --from=builder --chown=yapped:nodejs /app/.next/standalone ./
COPY --from=builder --chown=yapped:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=yapped:nodejs /app/public ./public

# Migrations and seeding do NOT run here. Hand-picking pieces of node_modules
# for the Prisma CLI is fragile — it silently misses transitive dependencies —
# so the `migrate` service in compose.yaml runs them from the builder stage,
# which has the complete dependency tree.
RUN mkdir -p /app/var/uploads && chown -R yapped:nodejs /app/var

USER yapped
EXPOSE 3000
VOLUME ["/app/var/uploads"]

CMD ["node", "server.js"]
