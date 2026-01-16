from fastapi import Header, HTTPException
from typing import Optional
import uuid
from datetime import datetime
from app.database import get_database

def generate_token() -> str:
    """生成唯一的 Token"""
    return str(uuid.uuid4())

def create_or_login_user(username: str) -> tuple[str, bool]:
    """
    创建或登录用户
    返回: (token, is_new_user)
    """
    db = get_database()
    
    # 查找用户
    user = db.users.find_one({"username": username})
    
    if user:
        # 用户已存在，更新最后登录时间
        token = generate_token()
        db.users.update_one(
            {"username": username},
            {
                "$set": {
                    "token": token,
                    "last_login": datetime.utcnow()
                }
            }
        )
        return token, False
    else:
        # 创建新用户前，检查用户总数
        user_count = db.users.count_documents({})
        if user_count >= 1000:
            raise HTTPException(
                status_code=403,
                detail="用户数量超上限，请联系作者"
            )
        
        # 创建新用户
        token = generate_token()
        db.users.insert_one({
            "username": username,
            "token": token,
            "created_at": datetime.utcnow(),
            "last_login": datetime.utcnow()
        })
        return token, True

def verify_token(authorization: Optional[str] = Header(None)) -> str:
    """
    验证 Token 并返回用户名
    用作 FastAPI 依赖项
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # 解析 Bearer Token
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = parts[1]
    
    # 验证 Token
    db = get_database()
    user = db.users.find_one({"token": token})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return user["username"]
