# ============================================================
# Stage 1: builder
# Installs all dependencies and compiles TypeScript.
# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .
# ============================================================
FROM node:22-alpine AS builder

# Install pnpm via corepack (version matches repo engines field).
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace manifests and lockfile first to leverage Docker layer cache.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

# Install all workspace deps (including devDependencies needed to build).
RUN pnpm install --frozen-lockfile

# Copy source.
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Build the api workspace.
RUN pnpm --filter api build

# Prune dev dependencies so only production deps remain for the runtime image.
RUN pnpm --filter api --prod deploy /app/pruned

# ============================================================
# Stage 2: runtime
# Minimal image: only dist/ + prod node_modules.
# ============================================================
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Copy the pruned production dependencies.
COPY --from=builder /app/pruned/node_modules ./node_modules

# Copy compiled output and migration artefacts.
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/db ./db

# Non-root user for security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
