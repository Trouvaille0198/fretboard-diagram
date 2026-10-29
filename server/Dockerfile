# 认证服务镜像（Node + SQLite）：只装服务端必需的 better-sqlite3，库文件挂 /data
# 用 bookworm-slim（glibc）：better-sqlite3 的预编译二进制基于 glibc，alpine(musl) 需现场编译
FROM node:24-bookworm-slim

WORKDIR /app

# 原生模块兜底工具链（预编译包拉不到时现场编译 better-sqlite3 用）
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN npm install --omit=dev better-sqlite3@^13.0.3

COPY server/index.js ./

ENV FRETB_DB=/data/data.db \
    FRETB_HOST=0.0.0.0 \
    PORT=8787

VOLUME /data
EXPOSE 8787

CMD ["node", "index.js"]
