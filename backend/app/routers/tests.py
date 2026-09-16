from fastapi import APIRouter, Depends, HTTPException, Header, Body
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
from datetime import datetime
from app.core.database import get_database

router = APIRouter(prefix="/api/tests", tags=["Tests"])

class TestItem(BaseModel):
    id: str
    name: str
    key: str
    standard: Optional[str] = "All"
    createdAt: Optional[str] = None

class TestCreate(BaseModel):
    name: str = Field(..., min_length=1)
    standard: Optional[str] = "All"

DEFAULT_TESTS = [
    {"id": "test-weekly", "name": "Weekly Test", "key": "weekly", "standard": "All", "createdAt": datetime.now().isoformat()},
    {"id": "test-monthly", "name": "Monthly Test", "key": "monthly", "standard": "All", "createdAt": datetime.now().isoformat()}
]

@router.get("", response_model=List[TestItem])
async def get_all_tests(
    standard: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    query: Dict[str, Any] = {}
    if standard and standard != "All":
        query["$or"] = [{"standard": "All"}, {"standard": standard}]

    tests = await db["tests"].find(query, {"_id": 0}).to_list(length=500)
    if not tests:
        # Initialize default tests in MongoDB if none exist
        for t in DEFAULT_TESTS:
            await db["tests"].update_one({"key": t["key"]}, {"$setOnInsert": t}, upsert=True)
        tests = await db["tests"].find(query, {"_id": 0}).to_list(length=500)
    return tests

@router.post("", response_model=TestItem, status_code=201)
async def create_test(
    data: TestCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    name_clean = data.name.strip()
    key_clean = name_clean.lower().replace(" ", "_").replace("-", "_")
    
    existing = await db["tests"].find_one({"$or": [{"key": key_clean}, {"name": name_clean}]})
    if existing:
        return TestItem(**existing)

    new_test = {
        "id": f"test-{uuid.uuid4().hex[:8]}",
        "name": name_clean,
        "key": key_clean,
        "standard": data.standard or "All",
        "createdAt": datetime.now().isoformat()
    }
    await db["tests"].insert_one(new_test)
    created = await db["tests"].find_one({"id": new_test["id"]}, {"_id": 0})
    return TestItem(**created)

@router.delete("/{test_id}")
async def delete_test(
    test_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    clean_id = test_id.strip()
    res = await db["tests"].delete_one({"$or": [{"id": clean_id}, {"key": clean_id}]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Test not found in MongoDB")
    return {"success": True, "message": "Test deleted from MongoDB"}
