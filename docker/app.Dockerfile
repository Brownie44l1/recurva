FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --outdir ./dist --target bun

FROM oven/bun:1-slim AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY package.json ./

RUN apt-get update -qq && apt-get install -y -qq curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
