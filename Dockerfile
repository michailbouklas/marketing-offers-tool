FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
RUN mkdir -p /temp/dev /temp/prod
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --production --frozen-lockfile

FROM base AS officecli
ARG OFFICECLI_VERSION=v1.0.140
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates libicu76 \
    && rm -rf /var/lib/apt/lists/* \
    && case "$(dpkg --print-architecture)" in \
         amd64) ASSET=officecli-linux-x64 ;; \
         arm64) ASSET=officecli-linux-arm64 ;; \
         *) echo "unsupported architecture" >&2; exit 1 ;; \
       esac \
    && cd /tmp \
    && curl -fsSLO "https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICECLI_VERSION}/${ASSET}" \
    && curl -fsSLO "https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICECLI_VERSION}/SHA256SUMS" \
    && grep "${ASSET}\$" SHA256SUMS | sha256sum -c - \
    && install -m 0755 "${ASSET}" /usr/local/bin/officecli \
    && rm -f "/tmp/${ASSET}" /tmp/SHA256SUMS \
    && officecli --version

FROM base AS builder
WORKDIR /app
COPY --from=install /temp/dev/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# nodejs: adapter-node's server must run under Node — Bun's node:http shim
# tears down streamed (SSE) responses abruptly, which the reverse proxy
# surfaces to browsers as ERR_HTTP2_PROTOCOL_ERROR after AI chat streams.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libicu76 nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=officecli /usr/local/bin/officecli /usr/local/bin/officecli
COPY --from=install /temp/prod/node_modules ./node_modules
COPY --from=builder /app/build ./build
EXPOSE 3000
CMD ["node", "build/index.js"]
