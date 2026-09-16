from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database

router = APIRouter(prefix="/api/timetables", tags=["Timetables"])

@router.get("")
async def get_all_timetables(db: AsyncIOMotorDatabase = Depends(get_database)):
    doc = await db["timetables"].find_one({"type": "schedule_store"}, {"_id": 0})
    if doc and "data" in doc:
        return doc["data"]
    return {}

@router.get("/{standard}")
async def get_timetable_for_standard(standard: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    doc = await db["timetables"].find_one({"type": "schedule_store"}, {"_id": 0})
    if doc and "data" in doc and standard in doc["data"]:
        return doc["data"][standard]
    return []

@router.put("/{standard}")
async def save_timetable_for_standard(
    standard: str,
    schedule: List[Dict[str, Any]] = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    await db["timetables"].update_one(
        {"type": "schedule_store"},
        {"$set": {f"data.{standard}": schedule}},
        upsert=True
    )
    return {"message": f"Timetable for '{standard}' saved successfully"}
