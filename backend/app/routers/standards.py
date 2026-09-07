from fastapi import APIRouter, Depends, HTTPException
from typing import List
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.models.standard import StandardCreate, ALL_DEFAULT_STANDARDS

router = APIRouter(prefix="/api/standards", tags=["Standards"])

@router.get("", response_model=List[str])
async def get_standards(db: AsyncIOMotorDatabase = Depends(get_database)):
    doc = await db["config"].find_one({"type": "standards"}, {"_id": 0})
    if doc and "list" in doc:
        return doc["list"]
    return ALL_DEFAULT_STANDARDS

@router.post("")
async def add_standard(data: StandardCreate, db: AsyncIOMotorDatabase = Depends(get_database)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Standard name cannot be empty")
    
    await db["config"].update_one(
        {"type": "standards"},
        {"$addToSet": {"list": name}},
        upsert=True
    )
    return {"message": f"Standard '{name}' added successfully"}
