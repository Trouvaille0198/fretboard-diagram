from fastapi import APIRouter, Depends, HTTPException
from app.models import LoginRequest, LoginResponse, VerifyResponse
from app.auth import create_or_login_user, verify_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """用户登录接口"""
    try:
        token, is_new = create_or_login_user(request.username)
        message = "登录成功" if not is_new else "注册成功"
        return LoginResponse(
            success=True,
            token=token,
            username=request.username,
            message=message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/verify", response_model=VerifyResponse)
async def verify(username: str = Depends(verify_token)):
    """验证 Token 接口"""
    return VerifyResponse(valid=True, username=username)
