from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from app.models import SaveDataRequest, SaveDataResponse, LoadDataResponse
from app.auth import verify_token
from app.database import get_database

router = APIRouter(prefix="/data", tags=["data"])

@router.post("/save", response_model=SaveDataResponse)
async def save_data(request: SaveDataRequest, username: str = Depends(verify_token)):
    """保存用户数据（全量替换）"""
    try:
        db = get_database()
        
        # 删除用户现有数据
        db.directories.delete_many({"username": username})
        db.states.delete_many({"username": username})
        
        # 插入目录数据
        if request.directories:
            directories_to_insert = []
            for dir_data in request.directories:
                directories_to_insert.append({
                    "username": username,
                    "directory_id": dir_data.id,
                    "name": dir_data.name,
                    "is_default": dir_data.isDefault,
                    "created_at": datetime.fromtimestamp(dir_data.createdAt / 1000)
                })
            db.directories.insert_many(directories_to_insert)
        
        # 插入状态数据
        if request.states:
            states_to_insert = []
            for state_data in request.states:
                states_to_insert.append({
                    "username": username,
                    "directory_id": state_data.directoryId,
                    "state_id": state_data.id,
                    "name": state_data.name,
                    "timestamp": state_data.timestamp,
                    "thumbnail": state_data.thumbnail,
                    "state": state_data.state,
                    "created_at": datetime.fromtimestamp(state_data.timestamp / 1000)
                })
            db.states.insert_many(states_to_insert)
        
        saved_at = datetime.utcnow()
        return SaveDataResponse(
            success=True,
            message=f"成功保存 {len(request.directories)} 个目录和 {len(request.states)} 个状态",
            saved_at=saved_at
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")

@router.get("/load", response_model=LoadDataResponse)
async def load_data(username: str = Depends(verify_token)):
    """加载用户数据"""
    try:
        db = get_database()
        
        # 查询目录
        directories_cursor = db.directories.find({"username": username})
        directories = []
        for dir_doc in directories_cursor:
            directories.append({
                "id": dir_doc["directory_id"],
                "name": dir_doc["name"],
                "createdAt": int(dir_doc["created_at"].timestamp() * 1000),
                "isDefault": dir_doc["is_default"]
            })
        
        # 查询状态
        states_cursor = db.states.find({"username": username})
        states = []
        for state_doc in states_cursor:
            states.append({
                "id": state_doc["state_id"],
                "directoryId": state_doc["directory_id"],
                "timestamp": state_doc["timestamp"],
                "name": state_doc["name"],
                "thumbnail": state_doc.get("thumbnail"),
                "state": state_doc["state"]
            })
        
        return LoadDataResponse(
            success=True,
            directories=directories,
            states=states
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"加载失败: {str(e)}")
