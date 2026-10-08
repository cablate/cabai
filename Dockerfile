# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Keep a complete production dependency tree in the runtime image. The app's
# standalone trace does not necessarily include the Drizzle migrator subpath
# used by the explicit one-shot migration command.
FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_ASSET_HOST=""
ENV NEXT_PUBLIC_ASSET_HOST=${NEXT_PUBLIC_ASSET_HOST}
ARG NEXT_PUBLIC_SITE_NAME=""
ENV NEXT_PUBLIC_SITE_NAME=${NEXT_PUBLIC_SITE_NAME}
ARG NEXT_PUBLIC_SITE_INITIAL=""
ENV NEXT_PUBLIC_SITE_INITIAL=${NEXT_PUBLIC_SITE_INITIAL}
ARG NEXT_PUBLIC_CREATOR_NAME=""
ENV NEXT_PUBLIC_CREATOR_NAME=${NEXT_PUBLIC_CREATOR_NAME}
ARG NEXT_PUBLIC_CREATOR_URL=""
ENV NEXT_PUBLIC_CREATOR_URL=${NEXT_PUBLIC_CREATOR_URL}
ARG NEXT_PUBLIC_SITE_DESCRIPTION=""
ENV NEXT_PUBLIC_SITE_DESCRIPTION=${NEXT_PUBLIC_SITE_DESCRIPTION}
ARG NEXT_PUBLIC_SITE_LOGO=""
ENV NEXT_PUBLIC_SITE_LOGO=${NEXT_PUBLIC_SITE_LOGO}
ARG NEXT_PUBLIC_SITE_SOCIAL_IMAGE=""
ENV NEXT_PUBLIC_SITE_SOCIAL_IMAGE=${NEXT_PUBLIC_SITE_SOCIAL_IMAGE}
ARG NEXT_PUBLIC_SITE_ILLUSTRATION=""
ENV NEXT_PUBLIC_SITE_ILLUSTRATION=${NEXT_PUBLIC_SITE_ILLUSTRATION}
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ARG APP_VERSION=0.1.0
ARG APP_REVISION=unknown
ARG APP_SOURCE_URL=unknown
LABEL org.opencontainers.image.title="CabAI" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_REVISION}" \
      org.opencontainers.image.source="${APP_SOURCE_URL}"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT_SHA=${APP_REVISION} \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    LOCAL_STORAGE_PATH=/app/data/storage \
    LOCAL_BACKUP_PATH=/app/data/backups

WORKDIR /app

# Backups and restore drills require a pg_dump/psql client compatible with the
# supported PostgreSQL 18 profile.
COPY scripts/install-postgres-client.sh /tmp/install-postgres-client.sh
RUN bash /tmp/install-postgres-client.sh \
    && rm /tmp/install-postgres-client.sh \
    && mkdir -p /app/logs /app/data/storage /app/data/backups \
    && chown -R node:node /app

# Application code and dependencies stay root-owned/read-only. Only the data
# and log directories created above are writable by the runtime user.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY --from=builder /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder /app/scripts/start-next-server.mjs ./scripts/start-next-server.mjs
COPY --from=builder /app/scripts/runtime-next-config.mjs ./scripts/runtime-next-config.mjs
COPY --from=builder /app/scripts/container-health.mjs ./scripts/container-health.mjs
COPY --from=builder /app/scripts/db-backup.ts ./scripts/db-backup.ts
COPY --from=builder /app/scripts/db-restore-drill.ts ./scripts/db-restore-drill.ts
COPY --from=builder /app/scripts/audit-applied-migrations.ts ./scripts/audit-applied-migrations.ts
COPY --from=builder /app/scripts/doctor.ts ./scripts/doctor.ts

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "scripts/container-health.mjs", "--readiness"]

# Single-instance deployments default to locked automatic migrations. Reference
# Compose and multi-replica deployments explicitly select MIGRATION_MODE=external
# and retain their one-shot migration owner.
CMD ["node", "scripts/start-production.mjs"]
