from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
import re

# 认证相关模型
class LoginRequest(BaseModel):
    username: str
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not v or len(v) < 3 or len(v) > 20:
            raise ValueError('用户名必须为 3-20 个字符')
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('用户名只能包含字母、数字和下划线')
        return v

class LoginResponse(BaseModel):
    success: bool
    token: str
    username: str
    message: str

class VerifyResponse(BaseModel):
    valid: bool
    username: Optional[str] = None

# 数据相关模型
class DirectoryData(BaseModel):
    id: str
    name: str
    createdAt: int
    isDefault: bool

class StateData(BaseModel):
    id: str
    directoryId: str = Field(alias='directoryId')
    timestamp: int
    name: str
    thumbnail: Optional[str] = None
    state: dict

    class Config:
        populate_by_name = True

class SaveDataRequest(BaseModel):
    directories: List[DirectoryData]
    states: List[StateData]
    
    @field_validator('directories')
    @classmethod
    def validate_directories(cls, v):
        if len(v) > 50:
            raise ValueError('目录数量不能超过 50 个')
        return v
    
    @field_validator('states')
    @classmethod
    def validate_states(cls, v):
        # 按目录分组检查
        dir_states = {}
        for state in v:
            dir_id = state.directoryId
            if dir_id not in dir_states:
                dir_states[dir_id] = []
            dir_states[dir_id].append(state)
        
        for dir_id, states in dir_states.items():
            if len(states) > 50:
                raise ValueError(f'目录 {dir_id} 的状态数量不能超过 50 条')
        return v

class SaveDataResponse(BaseModel):
    success: bool
    message: str
    saved_at: datetime

class LoadDataResponse(BaseModel):
    success: bool
    directories: List[dict]
    states: List[dict]
