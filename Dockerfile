FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @feedr/api --workspace @feedr/core --include-workspace-root --ignore-scripts
COPY packages/core packages/core
COPY apps/api apps/api
ENV NODE_ENV=production
EXPOSE 4100
CMD ["npx", "tsx", "apps/api/src/server.ts"]
