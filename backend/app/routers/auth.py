from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.models.auth import StaffLoginRequest, StudentLoginRequest, LoginResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/staff-login", response_model=LoginResponse)
async def staff_login(data: StaffLoginRequest):
    u = data.username.strip().lower()
    p = data.password.strip().lower()

    if u == "admin" and (p == "admin" or p == "admin123"):
        return LoginResponse(
            success=True,
            userType="admin",
            role="admin",
            userIdentifier="admin",
            name="Administrator",
            message="Admin login successful"
        )
    elif u == "staff" and (p == "staff" or p == "staff123"):
        return LoginResponse(
            success=True,
            userType="staff",
            role="staff",
            userIdentifier="staff",
            name="Staff Member",
            message="Staff login successful"
        )
    raise HTTPException(status_code=401, detail="Invalid staff / admin credentials")

@router.post("/student-login", response_model=LoginResponse)
async def student_login(data: StudentLoginRequest, db: AsyncIOMotorDatabase = Depends(get_database)):
    roll = data.rollNumber.strip()
    student = await db["students"].find_one({"rollNumber": roll})
    if not student:
        raise HTTPException(status_code=404, detail="No student found with this Roll Number")
    
    return LoginResponse(
        success=True,
        userType="student",
        role="student",
        userIdentifier=roll,
        name=student.get("name", roll),
        message="Student login successful"
    )
