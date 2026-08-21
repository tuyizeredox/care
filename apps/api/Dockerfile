# =============================================================================
#  OrgFlow API — production image
#
#  Build context is the REPOSITORY ROOT, not apps/api. The lockfile and the
#  hoisted node_modules both live there, so a context of apps/api cannot see
#  what npm needs. On Render set Dockerfile Path to apps/api/Dockerfile and
#  leave Docker Build Context Directory as the default "." (the root).
#
#  Two ordering constraints drive the layout below:
#
#   1. apps/api declares `postinstall: prisma generate`, so prisma/schema.prisma
#      must already be in the image before `npm ci` runs, or install dies.
#   2. The repo's root .npmrc sets `include=dev`, which beats --omit=dev. It is
#      deliberately NOT copied here: this file states the flags it wants
#      explicitly at each stage, so build tooling lands in the builder and stays
#      out of the runtime image.
# =============================================================================

# ---------------------------------------------------------------------------
#  Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:22.18-bookworm-slim AS builder

# Prisma's query engine links against OpenSSL; the slim image omits it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first, so a source-only change does not re-run the install layer.
# Both workspace manifests are required: npm validates the whole lockfile even
# when installing a single workspace.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Constraint (1): postinstall shells out to `prisma generate`.
COPY apps/api/prisma ./apps/api/prisma

# --include=dev is what was missing on Render: NODE_ENV=production makes npm's
# `omit` default to ["dev"], which strips @nestjs/cli and yields
# `sh: 1: nest: not found`. Here it is explicit and cannot drift.
RUN npm ci --include=dev --workspace=@orgflow/api --include-workspace-root

COPY apps/api ./apps/api
RUN npm run build:api

# ---------------------------------------------------------------------------
#  Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22.18-bookworm-slim AS runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/api/prisma ./apps/api/prisma

# Production dependencies only. The prisma CLI survives --omit=dev because
# @prisma/client declares it as an optional peer, so the lockfile marks it
# "devOptional" rather than "dev" -- which is also why `prisma generate` kept
# working on Render while `nest` did not. The CLI is needed at container start
# to apply migrations. postinstall regenerates the client against the schema
# copied above.
RUN npm ci --omit=dev --workspace=@orgflow/api --include-workspace-root \
 && npm cache clean --force

COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Uploads when STORAGE_PROVIDER=local. Without a mounted volume this is
# scratch space that empties on every restart -- see STORAGE_PROVIDER in the
# service config before relying on it.
#
# Only /var/data is chowned. `chown -R` over /app would rewrite every file into
# a fresh layer and roughly double the image; the node user needs read access
# there, which it already has, and never writes to it.
RUN mkdir -p /var/data/uploads && chown -R node:node /var/data

USER node

# Documentation only; the app binds process.env.PORT, which the host injects.
EXPOSE 4000

# Render's pre-deploy command is a paid feature, so migrations run here instead.
# `migrate deploy` only applies pending migrations and is a no-op once current.
CMD ["sh", "-c", "npm run prisma:deploy --workspace=@orgflow/api && npm run start:prod --workspace=@orgflow/api"]
