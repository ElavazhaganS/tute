from pydantic import BaseModel, Field
from typing import Optional

class ExamSchedule(BaseModel):
    id: Optional[str] = None
    testName: str = Field(..., min_length=1)  # e.g., "Mid-Term Examination", "Unit Test 1"
    standard: str
    subject: str
    examDate: str  # YYYY-MM-DD
    startTime: str = "09:30 AM"
    durationMinutes: int = 90
    maxMarks: int = 100

class ExamCreate(BaseModel):
    testName: str
    standard: str
    subject: str
    examDate: str
    startTime: str = "09:30 AM"
    durationMinutes: int = 90
    maxMarks: int = 100
