import re
from pydantic import BaseModel, Field, field_validator
from typing import Dict, Optional, List, Any
from app.models.review import ReviewItem

def validate_phone_str(v: Optional[str]) -> str:
    if not v or not str(v).strip():
        return ""
    clean = str(v).strip()
    digits = re.sub(r'\D', '', clean)
    if len(digits) < 7 or len(digits) > 15:
        raise ValueError("Phone number must contain between 7 and 15 digits")
    if not re.match(r'^[+]?[\d\s\-().]{7,25}$', clean):
        raise ValueError("Invalid phone number format")
    return clean

def validate_email_str(v: Optional[str]) -> str:
    if not v or not str(v).strip():
        return ""
    clean = str(v).strip()
    if not re.match(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', clean):
        raise ValueError("Invalid email address format")
    return clean

class SubjectMarks(BaseModel):
    english: int = Field(default=0, ge=0, le=100)
    math: int = Field(default=0, ge=0, le=100)
    science: int = Field(default=0, ge=0, le=100)
    history: int = Field(default=0, ge=0, le=100)

class StudentMarks(BaseModel):
    weekly: SubjectMarks = Field(default_factory=SubjectMarks)
    monthly: SubjectMarks = Field(default_factory=SubjectMarks)

class ParentDetails(BaseModel):
    fatherName: Optional[str] = ""
    fatherPhone: Optional[str] = ""
    motherName: Optional[str] = ""
    motherPhone: Optional[str] = ""

    @field_validator("fatherPhone", "motherPhone", mode="before")
    @classmethod
    def validate_parent_phones(cls, v: Any) -> str:
        return validate_phone_str(v)

class StudentBase(BaseModel):
    name: str = Field(..., min_length=1)
    studentId: Optional[str] = ""
    rollNumber: str = Field(..., min_length=1)
    dob: Optional[str] = ""
    gender: Optional[str] = "Male"
    standard: str = Field(..., min_length=1)
    section: str = "A"
    group: str = "General"  # "General", "Science Group", "Computer Group", "Arts Group", "Commerce Group"
    admissionDate: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    feesStatus: str = "Pending"  # "Paid" | "Pending" | "Partially Paid"
    feesAmount: float = 25000.0
    feesPaid: float = 0.0
    advanceFee: str = "Not Paid"  # "Paid" | "Not Paid"
    monthlyFees: Dict[str, str] = Field(default_factory=lambda: {
        m: "Not Paid" for m in ["june", "july", "august", "september", "october", "november", "december", "january", "february", "march", "april", "may"]
    })
    performanceComment: Optional[str] = "Enrolled recently."
    parent: Optional[ParentDetails] = Field(default_factory=ParentDetails)

    @field_validator("name", "rollNumber", "standard", mode="before")
    @classmethod
    def validate_required_strings(cls, v: Any) -> str:
        if not v or not str(v).strip():
            raise ValueError("Field cannot be empty")
        return str(v).strip()

    @field_validator("phone", mode="before")
    @classmethod
    def validate_student_phone(cls, v: Any) -> str:
        return validate_phone_str(v)

    @field_validator("email", mode="before")
    @classmethod
    def validate_student_email(cls, v: Any) -> str:
        return validate_email_str(v)

class StudentCreate(StudentBase):
    pass

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    studentId: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    standard: Optional[str] = None
    section: Optional[str] = None
    group: Optional[str] = None
    admissionDate: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    feesStatus: Optional[str] = None
    feesAmount: Optional[float] = None
    feesPaid: Optional[float] = None
    advanceFee: Optional[str] = None
    monthlyFees: Optional[Dict[str, str]] = None
    performanceComment: Optional[str] = None
    parent: Optional[ParentDetails] = None

    @field_validator("phone", mode="before")
    @classmethod
    def validate_update_phone(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return validate_phone_str(v)

    @field_validator("email", mode="before")
    @classmethod
    def validate_update_email(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return validate_email_str(v)

class StudentResponse(StudentBase):
    marks: Dict[str, Any] = Field(default_factory=dict)
    attendance: Dict[str, str] = Field(default_factory=dict)
    reviews: List[ReviewItem] = Field(default_factory=list)

class StudentMutationResponse(BaseModel):
    success: bool = True
    message: str
    student: Optional[StudentResponse] = None

class AttendanceUpdate(BaseModel):
    rollNumber: str
    studentId: Optional[str] = ""
    standard: Optional[str] = ""
    date: str  # YYYY-MM-DD
    status: Optional[str] = None  # 'P' | 'A' | None (to remove)

class MarksUpdate(BaseModel):
    testType: str  # 'weekly' | 'monthly' or any test name
    marks: Optional[SubjectMarks] = None
    scores: Optional[Dict[str, Any]] = None

class FeesUpdate(BaseModel):
    feesStatus: Optional[str] = None  # "Paid" | "Pending" | "Partially Paid"
    feesAmount: Optional[float] = None
    feesPaid: Optional[float] = None
    advanceFee: Optional[str] = None  # "Paid" | "Not Paid"
    monthlyFees: Optional[Dict[str, str]] = None
    month: Optional[str] = None
    monthStatus: Optional[str] = None
