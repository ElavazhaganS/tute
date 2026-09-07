from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database

router = APIRouter(prefix="/api/timetables", tags=["Timetables"])

DEFAULT_TIMETABLE = [
    {"period": "Period 1 (08:30 - 09:15)", "mon": "Mathematics", "tue": "Science", "wed": "English", "thu": "History", "fri": "Mathematics"},
    {"period": "Period 2 (09:20 - 10:05)", "mon": "Science", "tue": "Mathematics", "wed": "History", "thu": "English", "fri": "Science"},
    {"period": "Period 3 (10:10 - 10:55)", "mon": "English", "tue": "History", "wed": "Mathematics", "thu": "Science", "fri": "English"},
    {"period": "Break (10:55 - 11:30)", "mon": "Break", "tue": "Break", "wed": "Break", "thu": "Break", "fri": "Break"},
    {"period": "Period 4 (11:30 - 12:15)", "mon": "History", "tue": "English", "wed": "Science", "thu": "Mathematics", "fri": "Physical Ed"},
    {"period": "Period 5 (12:20 - 01:05)", "mon": "Computer Sci", "tue": "Computer Sci", "wed": "Art & Music", "thu": "Library", "fri": "Assembly"}
]

@router.get("")
async def get_all_timetables(db: AsyncIOMotorDatabase = Depends(get_database)):
    doc = await db["timetables"].find_one({"type": "schedule_store"}, {"_id": 0})
    if doc and "data" in doc:
        return doc["data"]
    return {"Default": DEFAULT_TIMETABLE}

@router.get("/{standard}")
async def get_timetable_for_standard(standard: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    doc = await db["timetables"].find_one({"type": "schedule_store"}, {"_id": 0})
    if doc and "data" in doc and standard in doc["data"]:
        return doc["data"][standard]
    return DEFAULT_TIMETABLE

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
