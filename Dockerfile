# Build stage: full toolchain, compiles Nest and generates the Prisma client.
FROM node:22-alpine AS build

RUN npm install -g pnpm@11

WORKDIR /app

# Schema first: pnpm's postinstall runs `prisma generate`, which needs it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# Drop dev dependencies; the compiled client lives in dist/generated and only
# needs the @prisma/client runtime package, which is a prod dependency.
# --ignore-scripts: prune would otherwise re-run the `prisma generate`
# postinstall right after removing the prisma CLI it needs.
RUN pnpm prune --prod --ignore-scripts

# Runtime stage: dist + prod node_modules, nothing to compile with.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The mock e-com runs from the same image until a real e-com exists.
COPY tools ./tools

EXPOSE 3000
CMD ["node", "dist/main.js"]
