from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from typing import Optional, List
from app.models import (
    SaveDataRequest, SaveDataResponse, LoadDataResponse,
    CreateDirectoryRequest, UpdateDirectoryRequest, DirectoryResponse,
    CreateStateRequest, UpdateStateRequest, StateResponse,
    StandardResponse
)
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
    """加载用户数据（兼容接口）"""
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

# ========== 目录管理 RESTful 接口 ==========

@router.post("/directories", response_model=DirectoryResponse, status_code=201)
async def create_directory(
    request: CreateDirectoryRequest,
    username: str = Depends(verify_token)
):
    """创建目录"""
    try:
        db = get_database()
        
        # 检查目录ID是否已存在
        existing = db.directories.find_one({
            "username": username,
            "directory_id": request.id
        })
        if existing:
            raise HTTPException(status_code=400, detail="目录ID已存在")
        
        # 插入新目录
        db.directories.insert_one({
            "username": username,
            "directory_id": request.id,
            "name": request.name,
            "is_default": request.isDefault,
            "created_at": datetime.fromtimestamp(request.createdAt / 1000)
        })
        
        return DirectoryResponse(
            id=request.id,
            name=request.name,
            createdAt=request.createdAt,
            isDefault=request.isDefault
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建目录失败: {str(e)}")

@router.get("/directories", response_model=List[DirectoryResponse])
async def get_directories(username: str = Depends(verify_token)):
    """获取所有目录"""
    try:
        db = get_database()
        
        directories_cursor = db.directories.find({"username": username})
        directories = []
        for dir_doc in directories_cursor:
            directories.append(DirectoryResponse(
                id=dir_doc["directory_id"],
                name=dir_doc["name"],
                createdAt=int(dir_doc["created_at"].timestamp() * 1000),
                isDefault=dir_doc["is_default"]
            ))
        
        return directories
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取目录失败: {str(e)}")

@router.put("/directories/{directory_id}", response_model=DirectoryResponse)
async def update_directory(
    directory_id: str,
    request: UpdateDirectoryRequest,
    username: str = Depends(verify_token)
):
    """更新目录"""
    try:
        db = get_database()
        
        # 查找目录
        directory = db.directories.find_one({
            "username": username,
            "directory_id": directory_id
        })
        if not directory:
            raise HTTPException(status_code=404, detail="目录不存在")
        
        # 构建更新数据
        update_data = {}
        if request.name is not None:
            update_data["name"] = request.name
        if request.isDefault is not None:
            update_data["is_default"] = request.isDefault
        
        if not update_data:
            raise HTTPException(status_code=400, detail="没有提供要更新的字段")
        
        # 更新目录
        db.directories.update_one(
            {"username": username, "directory_id": directory_id},
            {"$set": update_data}
        )
        
        # 返回更新后的目录
        updated = db.directories.find_one({
            "username": username,
            "directory_id": directory_id
        })
        
        return DirectoryResponse(
            id=updated["directory_id"],
            name=updated["name"],
            createdAt=int(updated["created_at"].timestamp() * 1000),
            isDefault=updated["is_default"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新目录失败: {str(e)}")

@router.delete("/directories/{directory_id}", response_model=StandardResponse)
async def delete_directory(
    directory_id: str,
    username: str = Depends(verify_token)
):
    """删除目录及其关联的状态"""
    try:
        db = get_database()
        
        # 检查目录是否存在
        directory = db.directories.find_one({
            "username": username,
            "directory_id": directory_id
        })
        if not directory:
            raise HTTPException(status_code=404, detail="目录不存在")
        
        # 删除目录及其关联的状态
        db.directories.delete_one({
            "username": username,
            "directory_id": directory_id
        })
        db.states.delete_many({
            "username": username,
            "directory_id": directory_id
        })
        
        return StandardResponse(
            success=True,
            message="目录已删除"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除目录失败: {str(e)}")

# ========== 状态管理 RESTful 接口 ==========

@router.post("/states", response_model=StateResponse, status_code=201)
async def create_state(
    request: CreateStateRequest,
    username: str = Depends(verify_token)
):
    """创建状态"""
    try:
        db = get_database()
        
        # 检查状态ID是否已存在
        existing = db.states.find_one({
            "username": username,
            "state_id": request.id
        })
        if existing:
            raise HTTPException(status_code=400, detail="状态ID已存在")
        
        # 验证目录是否存在
        directory = db.directories.find_one({
            "username": username,
            "directory_id": request.directoryId
        })
        if not directory:
            raise HTTPException(status_code=404, detail="目录不存在")
        
        # 插入新状态
        db.states.insert_one({
            "username": username,
            "directory_id": request.directoryId,
            "state_id": request.id,
            "name": request.name,
            "timestamp": request.timestamp,
            "thumbnail": request.thumbnail,
            "state": request.state,
            "created_at": datetime.fromtimestamp(request.timestamp / 1000)
        })
        
        return StateResponse(
            id=request.id,
            directoryId=request.directoryId,
            timestamp=request.timestamp,
            name=request.name,
            thumbnail=request.thumbnail,
            state=request.state
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建状态失败: {str(e)}")

@router.get("/states", response_model=List[StateResponse])
async def get_states(
    directory_id: Optional[str] = Query(None, alias="directoryId"),
    username: str = Depends(verify_token)
):
    """获取状态（支持按目录筛选）"""
    try:
        db = get_database()
        
        # 构建查询条件
        query = {"username": username}
        if directory_id:
            query["directory_id"] = directory_id
        
        states_cursor = db.states.find(query)
        states = []
        for state_doc in states_cursor:
            states.append(StateResponse(
                id=state_doc["state_id"],
                directoryId=state_doc["directory_id"],
                timestamp=state_doc["timestamp"],
                name=state_doc["name"],
                thumbnail=state_doc.get("thumbnail"),
                state=state_doc["state"]
            ))
        
        return states
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取状态失败: {str(e)}")

@router.put("/states/{state_id}", response_model=StateResponse)
async def update_state(
    state_id: str,
    request: UpdateStateRequest,
    username: str = Depends(verify_token)
):
    """更新状态"""
    try:
        db = get_database()
        
        # 查找状态
        state = db.states.find_one({
            "username": username,
            "state_id": state_id
        })
        if not state:
            raise HTTPException(status_code=404, detail="状态不存在")
        
        # 如果更新目录ID，验证新目录是否存在
        if request.directoryId is not None:
            directory = db.directories.find_one({
                "username": username,
                "directory_id": request.directoryId
            })
            if not directory:
                raise HTTPException(status_code=404, detail="目标目录不存在")
        
        # 构建更新数据
        update_data = {}
        if request.directoryId is not None:
            update_data["directory_id"] = request.directoryId
        if request.name is not None:
            update_data["name"] = request.name
        if request.timestamp is not None:
            update_data["timestamp"] = request.timestamp
            update_data["created_at"] = datetime.fromtimestamp(request.timestamp / 1000)
        if request.thumbnail is not None:
            update_data["thumbnail"] = request.thumbnail
        if request.state is not None:
            update_data["state"] = request.state
        
        if not update_data:
            raise HTTPException(status_code=400, detail="没有提供要更新的字段")
        
        # 更新状态
        db.states.update_one(
            {"username": username, "state_id": state_id},
            {"$set": update_data}
        )
        
        # 返回更新后的状态
        updated = db.states.find_one({
            "username": username,
            "state_id": state_id
        })
        
        return StateResponse(
            id=updated["state_id"],
            directoryId=updated["directory_id"],
            timestamp=updated["timestamp"],
            name=updated["name"],
            thumbnail=updated.get("thumbnail"),
            state=updated["state"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新状态失败: {str(e)}")

@router.delete("/states/{state_id}", response_model=StandardResponse)
async def delete_state(
    state_id: str,
    username: str = Depends(verify_token)
):
    """删除状态"""
    try:
        db = get_database()
        
        # 检查状态是否存在
        state = db.states.find_one({
            "username": username,
            "state_id": state_id
        })
        if not state:
            raise HTTPException(status_code=404, detail="状态不存在")
        
        # 删除状态
        db.states.delete_one({
            "username": username,
            "state_id": state_id
        })
        
        return StandardResponse(
            success=True,
            message="状态已删除"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除状态失败: {str(e)}")
