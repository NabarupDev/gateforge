FROM node:22-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared ./shared
COPY gateway ./gateway
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
RUN pnpm run build --filter @gateforge/shared
RUN pnpm run build --filter @gateforge/gateway

FROM node:22-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@gateforge/gateway", "start"]
