import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.models.student import (
    StudentCreate,
    StudentUpdate,
    StudentResponse,
    StudentMutationResponse,
    AttendanceUpdate,
    MarksUpdate,
    FeesUpdate,
)
from app.models.review import ReviewCreate, ReviewItem

logger = logging.getLogger("schoolhub.students")
router = APIRouter(prefix="/api/students", tags=["Students"])

# ── Helper: Enforce that only staff/admin can perform writes ──────────────────
def require_staff_role(x_user_role: Optional[str] = Header(None)):
    """
    Lightweight role guard. Frontend sends 'X-User-Role: admin' or
    'X-User-Role: staff' on every mutating request. Students (or
    unauthenticated callers) are rejected.
    """
    allowed = {"admin", "staff"}
    if not x_user_role or x_user_role.lower().strip() not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Access denied: only authorized Staff/Admin can manage student records."
        )


# ── READ ENDPOINTS ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[StudentResponse])
async def get_students(
    standard: Optional[str] = Query(None, description="Filter by standard"),
    section: Optional[str] = Query(None, description="Filter by section"),
    search: Optional[str] = Query(None, description="Search by name, rollNumber, studentId, or parent phone number"),
    fees_status: Optional[str] = Query(None, description="Filter by fee status"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Returns all students from MongoDB Atlas with optional filtering and search.
    """
    try:
        query: Dict[str, Any] = {}
        if standard and standard != "All":
            query["standard"] = standard
        if section and section != "All":
            query["section"] = section
        if fees_status and fees_status != "All":
            query["feesStatus"] = fees_status
        if search:
            search_clean = search.strip()
            query["$or"] = [
                {"name": {"$regex": search_clean, "$options": "i"}},
                {"rollNumber": {"$regex": search_clean, "$options": "i"}},
                {"studentId": {"$regex": search_clean, "$options": "i"}},
                {"email": {"$regex": search_clean, "$options": "i"}},
                {"phone": {"$regex": search_clean, "$options": "i"}},
                {"parent.fatherName": {"$regex": search_clean, "$options": "i"}},
                {"parent.fatherPhone": {"$regex": search_clean, "$options": "i"}},
                {"parent.motherName": {"$regex": search_clean, "$options": "i"}},
                {"parent.motherPhone": {"$regex": search_clean, "$options": "i"}},
                {"parent.emergencyContactName": {"$regex": search_clean, "$options": "i"}},
                {"parent.emergencyContactPhone": {"$regex": search_clean, "$options": "i"}}
            ]

        cursor = db["students"].find(query, {"_id": 0})
        students = await cursor.to_list(length=3000)
        return students
    except Exception as e:
        logger.error(f"Error fetching students from MongoDB: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred while fetching students")


@router.get("/me/{identifier}", response_model=StudentResponse)
async def get_my_student_data(
    identifier: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Student-scoped endpoint: returns only the record matching rollNumber or studentId.
    """
    clean_id = identifier.strip()
    student = await db["students"].find_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"_id": 0}
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found in MongoDB")
    return student


@router.get("/{identifier}", response_model=StudentResponse)
async def get_student_by_id(
    identifier: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    clean_id = identifier.strip()
    student = await db["students"].find_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"_id": 0}
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in registry")
    return student


# ── WRITE ENDPOINTS (Staff / Admin Only) ──────────────────────────────────────

@router.post("", response_model=StudentMutationResponse, status_code=201)
async def create_student(
    data: StudentCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)

    roll = data.rollNumber.strip()
    # Check for duplicates by rollNumber or studentId
    existing = await db["students"].find_one({
        "$or": [
            {"rollNumber": roll},
            {"studentId": data.studentId.strip()} if data.studentId else {"rollNumber": roll}
        ]
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"A student with Roll Number '{roll}' or Student ID already exists")

    student_dict = data.model_dump()
    student_dict["rollNumber"] = roll
    if not student_dict.get("studentId"):
        student_dict["studentId"] = f"STU-{roll}"
    student_dict["marks"] = {
        "weekly": {"english": 0, "math": 0, "science": 0, "history": 0},
        "monthly": {"english": 0, "math": 0, "science": 0, "history": 0}
    }
    student_dict["attendance"] = {}
    student_dict["reviews"] = []

    try:
        await db["students"].insert_one(student_dict)
        created = await db["students"].find_one({"rollNumber": roll}, {"_id": 0})
        return {
            "success": True,
            "message": "Student added successfully",
            "student": created
        }
    except Exception as e:
        logger.error(f"Error creating student in MongoDB: {e}")
        raise HTTPException(status_code=500, detail="Failed to save student record to MongoDB Atlas")


@router.put("/{identifier}", response_model=StudentMutationResponse)
async def update_student(
    identifier: str,
    data: StudentUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    try:
        result = await db["students"].update_one(
            {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail=f"Student '{identifier}' not found in MongoDB")

        updated = await db["students"].find_one(
            {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
            {"_id": 0}
        )
        return {
            "success": True,
            "message": "Student updated successfully",
            "student": updated
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating student in MongoDB: {e}")
        raise HTTPException(status_code=500, detail="Failed to update student in MongoDB Atlas")


@router.delete("/{identifier}")
async def delete_student(
    identifier: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    try:
        result = await db["students"].delete_one(
            {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"Student '{identifier}' not found in MongoDB")
        return {
            "success": True,
            "message": "Student deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting student from MongoDB: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete student from MongoDB Atlas")


# ── ATTENDANCE, MARKS, FEES, REVIEWS ──────────────────────────────────────────

@router.post("/attendance/toggle")
async def toggle_attendance(
    data: AttendanceUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)

    student = await db["students"].find_one({"rollNumber": data.rollNumber})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    attendance = student.get("attendance", {})
    current_status = attendance.get(data.date)

    if current_status == data.status or not data.status:
        await db["students"].update_one(
            {"rollNumber": data.rollNumber},
            {"$unset": {f"attendance.{data.date}": ""}}
        )
        new_status = None
    else:
        await db["students"].update_one(
            {"rollNumber": data.rollNumber},
            {"$set": {f"attendance.{data.date}": data.status}}
        )
        new_status = data.status

    return {"rollNumber": data.rollNumber, "date": data.date, "status": new_status, "success": True}


@router.put("/{identifier}/marks")
async def update_marks(
    identifier: str,
    data: MarksUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    if data.testType not in ["weekly", "monthly"]:
        raise HTTPException(status_code=400, detail="testType must be 'weekly' or 'monthly'")

    result = await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$set": {f"marks.{data.testType}": data.marks.model_dump()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")

    return {
        "success": True,
        "message": "Marks updated successfully",
        "rollNumber": identifier,
        "testType": data.testType
    }


@router.put("/{identifier}/fees")
async def update_fees(
    identifier: str,
    data: FeesUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    update_data = {"feesStatus": data.feesStatus}
    if data.feesAmount is not None:
        update_data["feesAmount"] = data.feesAmount
    if data.feesPaid is not None:
        update_data["feesPaid"] = data.feesPaid

    result = await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    return {
        "success": True,
        "message": "Fees status updated successfully",
        "rollNumber": identifier
    }


@router.get("/{identifier}/reviews", response_model=List[ReviewItem])
async def get_student_reviews(
    identifier: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    clean_id = identifier.strip()
    student = await db["students"].find_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"_id": 0, "reviews": 1}
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student.get("reviews", [])


@router.post("/{identifier}/reviews", response_model=ReviewItem)
async def add_student_review(
    identifier: str,
    data: ReviewCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    review_obj = data.model_dump()
    review_obj["id"] = str(uuid.uuid4())[:8]
    review_obj["createdAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    result = await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$push": {"reviews": review_obj}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")

    return review_obj
