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
from app.models.review import ReviewCreate, ReviewItem, ReviewUpdate

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


@router.get("/{identifier}/rank")
async def get_student_class_rank(
    identifier: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Returns student's rank within their standard based on total marks, preserving privacy.
    """
    clean_id = identifier.strip()
    student = await db["students"].find_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"_id": 0, "rollNumber": 1, "standard": 1, "marks": 1}
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    standard = student.get("standard")
    if not standard:
        return {"rank": "N/A", "total": 1, "standard": ""}

    classmates = await db["students"].find(
        {"standard": standard},
        {"_id": 0, "rollNumber": 1, "name": 1, "marks": 1}
    ).to_list(length=3000)

    def calc_total(s):
        marks = s.get("marks", {}) or {}
        w = marks.get("weekly", {}) or {}
        m = marks.get("monthly", {}) or {}
        w_tot = sum(float(w.get(sub, 0) or 0) for sub in ["english", "math", "science", "history"])
        m_tot = sum(float(m.get(sub, 0) or 0) for sub in ["english", "math", "science", "history"])
        return w_tot + m_tot

    ranked = sorted(
        classmates,
        key=lambda s: (-calc_total(s), s.get("name", ""))
    )

    assigned_rank = 1
    my_rank = 1
    prev_total = None
    for idx, s in enumerate(ranked):
        tot = calc_total(s)
        if idx > 0 and tot == prev_total:
            pass
        else:
            assigned_rank = idx + 1
        prev_total = tot
        if s.get("rollNumber") == student.get("rollNumber"):
            my_rank = assigned_rank
            break

    return {
        "rollNumber": student.get("rollNumber"),
        "standard": standard,
        "rank": my_rank,
        "total": len(classmates)
    }


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

    student_id = data.studentId or student.get("studentId", f"STU-{data.rollNumber}")
    standard = data.standard or student.get("standard", "")
    attendance = student.get("attendance", {})
    current_status = attendance.get(data.date)

    if current_status == data.status or not data.status:
        # Unset / remove attendance
        await db["students"].update_one(
            {"rollNumber": data.rollNumber},
            {"$unset": {f"attendance.{data.date}": ""}}
        )
        await db["attendance_records"].delete_one({
            "rollNumber": data.rollNumber,
            "date": data.date
        })
        new_status = None
    else:
        # Set status: Present ('P') or Absent ('A')
        await db["students"].update_one(
            {"rollNumber": data.rollNumber},
            {"$set": {f"attendance.{data.date}": data.status}}
        )
        # Store structured attendance record with Student ID, Standard, Date, Status with duplicate prevention
        await db["attendance_records"].update_one(
            {"rollNumber": data.rollNumber, "date": data.date},
            {
                "$set": {
                    "studentId": student_id,
                    "rollNumber": data.rollNumber,
                    "standard": standard,
                    "date": data.date,
                    "status": data.status,
                    "updatedAt": datetime.now().isoformat()
                }
            },
            upsert=True
        )
        new_status = data.status

    return {
        "studentId": student_id,
        "rollNumber": data.rollNumber,
        "standard": standard,
        "date": data.date,
        "status": new_status,
        "success": True
    }


@router.put("/{identifier}/marks")
async def update_marks(
    identifier: str,
    data: MarksUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    student = await db["students"].find_one({"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    test_type = data.testType.strip()
    test_key = test_type.replace(".", "_")

    if data.marks is not None:
        marks_dict = data.marks.model_dump()
    elif data.scores is not None:
        marks_dict = data.scores
    else:
        marks_dict = {"english": 0, "math": 0, "science": 0, "history": 0}

    # Store in student record without duplicates
    await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$set": {f"marks.{test_key}": marks_dict}}
    )

    # Also store in marks_records collection for audit / query consistency
    await db["marks_records"].update_one(
        {"rollNumber": student["rollNumber"], "testName": test_type},
        {
            "$set": {
                "rollNumber": student["rollNumber"],
                "studentId": student.get("studentId", ""),
                "standard": student.get("standard", ""),
                "testName": test_type,
                "marks": marks_dict,
                "updatedAt": datetime.now().isoformat()
            }
        },
        upsert=True
    )

    return {
        "success": True,
        "message": "Marks updated successfully",
        "rollNumber": student["rollNumber"],
        "testType": test_type
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

    update_data = {}
    if data.feesStatus is not None:
        update_data["feesStatus"] = data.feesStatus
    if data.feesAmount is not None:
        update_data["feesAmount"] = data.feesAmount
    if data.feesPaid is not None:
        update_data["feesPaid"] = data.feesPaid
    if data.advanceFee is not None:
        update_data["advanceFee"] = data.advanceFee
    if data.monthlyFees is not None:
        update_data["monthlyFees"] = data.monthlyFees
    if data.month and data.monthStatus:
        update_data[f"monthlyFees.{data.month}"] = data.monthStatus

    if not update_data:
        raise HTTPException(status_code=400, detail="No fee fields provided for update")

    result = await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")

    updated_student = await db["students"].find_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"_id": 0}
    )

    return {
        "success": True,
        "message": "Fees status updated successfully",
        "rollNumber": identifier,
        "student": updated_student
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

    student = await db["students"].find_one({"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    review_obj = data.model_dump()
    review_obj["id"] = str(uuid.uuid4())[:8]
    if not review_obj.get("studentName"):
        review_obj["studentName"] = student.get("name", "")
    if review_obj.get("maxMarks", 0) > 0 and (not review_obj.get("percentage") or review_obj.get("percentage") == 0):
        review_obj["percentage"] = round(((review_obj.get("marks", 0) or 0) / review_obj["maxMarks"]) * 100, 1)
    review_obj["createdAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    result = await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$push": {"reviews": review_obj}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")

    return review_obj


@router.put("/{identifier}/reviews/{review_id}", response_model=ReviewItem)
async def update_student_review(
    identifier: str,
    review_id: str,
    data: ReviewUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    x_user_role: Optional[str] = Header(None)
):
    require_staff_role(x_user_role)
    clean_id = identifier.strip()

    student = await db["students"].find_one({"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    reviews = student.get("reviews", [])
    target_idx = None
    for i, r in enumerate(reviews):
        if r.get("id") == review_id:
            target_idx = i
            break

    if target_idx is None:
        raise HTTPException(status_code=404, detail=f"Review with id '{review_id}' not found")

    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    update_fields["updatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Recalculate percentage if marks or maxMarks updated
    marks = update_fields.get("marks", reviews[target_idx].get("marks", 0.0))
    max_marks = update_fields.get("maxMarks", reviews[target_idx].get("maxMarks", 100.0))
    if max_marks and max_marks > 0 and ("marks" in update_fields or "maxMarks" in update_fields):
        update_fields["percentage"] = round((marks / max_marks) * 100, 1)

    for k, v in update_fields.items():
        reviews[target_idx][k] = v

    await db["students"].update_one(
        {"$or": [{"rollNumber": clean_id}, {"studentId": clean_id}]},
        {"$set": {"reviews": reviews}}
    )

    return reviews[target_idx]
