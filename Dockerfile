# Asena bot image. Made for hosts like Render: set SESSION_ID and the bot keeps its
# login and settings on the Asena server, so the container needs no disk.
# Debian with Node: calls carry their audio in a Node helper (@roamhq/wrtc crashes Bun and has no musl build).
FROM node:22-bookworm-slim
COPY --from=oven/bun:1.4-debian /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    AUTH_DB=sqlite
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["bun", "src/index.ts"]
