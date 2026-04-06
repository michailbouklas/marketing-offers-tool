FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
RUN mkdir -p /temp/dev /temp/prod
COPY package.json /temp/dev/
RUN cd /temp/dev && bun install --no-save
COPY package.json /temp/prod/
RUN cd /temp/prod && bun install --production --no-save

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
COPY --from=install /temp/prod/node_modules ./node_modules
COPY --from=builder /app/build ./build
EXPOSE 3000
CMD ["bun", "build/index.js"]