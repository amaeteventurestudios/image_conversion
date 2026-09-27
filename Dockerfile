# Works on arm64 (Raspberry Pi 4/5) and amd64. sharp, better-sqlite3 and
# @node-rs/argon2 all ship prebuilt binaries for linux-arm64 glibc.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data TRUST_PROXY=1
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/index.ts"]
