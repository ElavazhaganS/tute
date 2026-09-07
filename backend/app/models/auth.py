from pydantic import BaseModel
from typing import Optional

class StaffLoginRequest(BaseModel):
    username: str
    password: str

class StudentLoginRequest(BaseModel):
    rollNumber: str
    password: Optional[str] = ""

class LoginResponse(BaseModel):
    success: bool
    userType: str  # 'admin' | 'staff' | 'student'
    role: str      # 'admin' | 'staff' | 'student'
    userIdentifier: str
    name: str
    message: str
