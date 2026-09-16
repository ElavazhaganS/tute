from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ReviewItem(BaseModel):
    id: Optional[str] = None
    studentName: Optional[str] = ""
    testName: Optional[str] = "General Evaluation"
    marks: Optional[float] = 0.0
    maxMarks: Optional[float] = 100.0
    percentage: Optional[float] = 0.0
    reviewer: str = "Administrator"
    category: str = "Academic"  # Academic | Behavior | Extracurricular | Overall
    rating: int = Field(default=5, ge=1, le=5)
    comment: str
    createdAt: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))
    updatedAt: Optional[str] = None

class ReviewCreate(BaseModel):
    studentName: Optional[str] = ""
    testName: Optional[str] = "General Evaluation"
    marks: Optional[float] = 0.0
    maxMarks: Optional[float] = 100.0
    percentage: Optional[float] = 0.0
    reviewer: str = "Administrator"
    category: str = "Academic"
    rating: int = Field(default=5, ge=1, le=5)
    comment: str

class ReviewUpdate(BaseModel):
    studentName: Optional[str] = None
    testName: Optional[str] = None
    marks: Optional[float] = None
    maxMarks: Optional[float] = None
    percentage: Optional[float] = None
    reviewer: Optional[str] = None
    category: Optional[str] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment: Optional[str] = None
