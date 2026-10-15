# ---- fetch cloudflared (the app spawns this itself to open tunnels) ----
FROM alpine:3.20 AS cloudflared
RUN apk add --no-cache curl
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) CF_ARCH=amd64 ;; \
      arm64) CF_ARCH=arm64 ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /cloudflared \
       "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
    && chmod +x /cloudflared

# ---- build TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- final runtime image ----
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY public ./public
COPY public-share ./public-share
COPY public-common ./public-common
COPY --from=cloudflared /cloudflared /usr/local/bin/cloudflared

RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /data \
    && chown -R app:app /app /data
USER app

ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["node", "dist/server.js"]
