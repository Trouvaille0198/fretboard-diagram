from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection
from app.routers import auth, data

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时连接数据库
    connect_to_mongo()
    yield
    # 关闭时断开连接
    close_mongo_connection()

app = FastAPI(
    title="Fretboard Diagram API",
    description="简单登录功能 API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(data.router, prefix=settings.API_PREFIX)

@app.get("/")
async def root():
    return {"message": "Fretboard Diagram API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
