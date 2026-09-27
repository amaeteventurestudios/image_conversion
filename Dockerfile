# Works on arm64 (Raspberry Pi 4/5) and amd64. sharp, better-sqlite3 and
# @node-rs/argon2 usually ship prebuilt binaries for linux-arm64 glibc, but a
# missing prebuild (e.g. better-sqlite3 on a new Node minor) falls back to source.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain so native modules can compile if no prebuilt binary is available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
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
