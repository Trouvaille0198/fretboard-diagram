# 认证服务镜像（Node + SQLite）：只装服务端必需的 better-sqlite3，库文件挂 /data
# 用 bookworm-slim（glibc）：better-sqlite3 的预编译二进制基于 glibc，alpine(musl) 需现场编译
FROM node:24-bookworm-slim

WORKDIR /app

# 原生模块兜底工具链（预编译包拉不到时现场编译 better-sqlite3 用）
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN npm install --omit=dev better-sqlite3@^13.0.3 lz-string@^1.4.4

# index.js import 的 packChart 模块链（chartPack 及其 src/utils 传递依赖）
COPY src/utils/ /src/utils/
# /src/utils 下裸包名（lz-string）解析向上找不到 /app/node_modules，链接过去
RUN ln -s /app/node_modules /src/node_modules

COPY server/index.js ./

ENV FRETB_DB=/data/data.db \
    FRETB_HOST=0.0.0.0 \
    PORT=8787

VOLUME /data
EXPOSE 8787

CMD ["node", "index.js"]
