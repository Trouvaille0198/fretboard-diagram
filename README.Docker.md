# Docker 使用说明

## 快速开始

### 生产环境

构建并启动生产环境容器：

```bash
docker-compose up -d
```

应用将在 http://localhost:1645 上运行。

### 开发环境

启动开发环境（支持热重载）：

```bash
docker-compose --profile dev up fretboard-diagram-dev
```

开发服务器将在 http://localhost:5173 上运行。

## 常用命令

### 构建镜像

```bash
docker-compose build
```

### 查看日志

```bash
docker-compose logs -f
```

### 停止服务

```bash
docker-compose down
```

### 重新构建并启动

```bash
docker-compose up -d --build
```

### 进入容器

```bash
docker-compose exec fretboard-diagram sh
```

## 环境说明

- **生产环境**：使用nginx提供构建后的静态文件，端口8080
- **开发环境**：使用Vite开发服务器，端口5173，支持热重载

## 注意事项

1. 确保已安装Docker和Docker Compose
2. 首次运行会自动构建镜像，可能需要一些时间
3. 开发环境会挂载源代码目录，修改代码会自动热重载
