# ---- Build stage ----
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- Runtime stage ----
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV KAFKA_EXPLORER_BIND_HOST=0.0.0.0

# Runtime dependencies (Express, KafkaJS, cors) only.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared

EXPOSE 8787
CMD ["bun", "run", "server:start"]
