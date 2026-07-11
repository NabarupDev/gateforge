FROM node:22-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared ./shared
COPY services/ai-service ./services/ai-service
RUN pnpm install --frozen-lockfile
RUN pnpm run build --filter @gateforge/shared
RUN pnpm run build --filter @gateforge/ai-service

FROM node:22-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 3003
CMD ["pnpm", "--filter", "@gateforge/ai-service", "start"]
