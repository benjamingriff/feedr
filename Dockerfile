# The feedr API. Railway builds this from the repo root (railway.json); compose.yaml runs it locally.
FROM node:24-alpine
WORKDIR /app
# pnpm comes from corepack, at the version in package.json's packageManager.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# Every workspace's package.json, so the lockfile matches; only the API's production deps are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --prod --filter @feedr/api...
COPY packages/core packages/core
COPY apps/api apps/api
ENV NODE_ENV=production
EXPOSE 4100
WORKDIR /app/apps/api
CMD ["node_modules/.bin/tsx", "src/server.ts"]
