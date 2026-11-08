# Cverixa production image: Next.js server with Chromium for PDF rendering.
# Build:  docker build -t cverixa .
# Run:    docker run --env-file .env -p 3000:3000 cverixa

FROM mcr.microsoft.com/playwright:v1.65.0-noble AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/tsconfig.json ./
EXPOSE 3000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec next start -p ${PORT}"]
