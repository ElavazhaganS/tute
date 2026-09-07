import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.models.exam import ExamCreate, ExamSchedule

router = APIRouter(prefix="/api/exams", tags=["Exams"])


def require_staff_role(x_user_role: Optional[str] = Header(None)):
    allowed = {"admin", "staff"}
    if not x_user_role or x_user_role.lower().strip() not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Access denied: only staff/admin can perform this operation."
        )


@router.get("", response_model=List[ExamSchedule])
async def get_exams(
    standard: Optional[str] = Query(None, description="Filter by standard"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    query = {}
    if standard and standard != "All":
        query["standard"] = standard

    cursor = db["exams"].find(query, {"_id": 0})
    exams = await cursor.to_list(length=500)
    return exams


@router.post("", response_model=ExamSchedule, status_code=201)
async def create_exam(
    data: ExamCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)

    exam_dict = data.model_dump()
    exam_dict["id"] = str(uuid.uuid4())[:8]

    await db["exams"].insert_one(exam_dict)
    created = await db["exams"].find_one({"id": exam_dict["id"]}, {"_id": 0})
    return created


@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)

    result = await db["exams"].delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Exam schedule not found")
    return {"message": "Exam schedule deleted successfully"}
