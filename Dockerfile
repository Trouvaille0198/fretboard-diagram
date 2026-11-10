# 多阶段构建：构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 原生模块编译工具链：根 package.json 混着服务端的 better-sqlite3（musl 无预编译，需现场编译；
# 与 server/Dockerfile 的 glibc+工具链先例同理），多阶段构建不进最终镜像
RUN apk add --no-cache python3 make g++

# 安装pnpm（钉主版本：不钉的话 latest 一漂移就崩——pnpm 12 段错误 / pnpm 11.22 要 Node≥22）；
# pnpm 10 支持 Node 20 且与 lockfileVersion 9.0 兼容（宿主 pnpm 11 生成，9/10 同格式）
RUN npm install -g pnpm@10

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN pnpm build

# 生产阶段：使用nginx提供静态文件
FROM nginx:alpine

# 复制构建产物到nginx目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
