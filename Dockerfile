FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY public ./public
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache sqlite

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/shared_brain.db

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Volume mount point for persistent SQLite data
VOLUME [ "/app/data" ]

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
