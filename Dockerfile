FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM alpine:3.19
ARG PB_VERSION=0.40.4

# curl: admin-token one-liners in CLAUDE.md (busybox wget returns empty inside $())
RUN apk add --no-cache wget unzip ca-certificates curl

RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    -O /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /pb && \
    rm /tmp/pb.zip && \
    chmod +x /pb/pocketbase

COPY --from=frontend-builder /app/dist /pb/pb_public
COPY pocketbase/entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh
COPY pocketbase/pb_migrations/ /pb/pb_migrations/

EXPOSE 8090
ENTRYPOINT ["/pb/entrypoint.sh"]
