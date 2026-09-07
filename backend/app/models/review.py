from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ReviewItem(BaseModel):
    id: Optional[str] = None
    reviewer: str = "Administrator"
    category: str = "Academic"  # Academic | Behavior | Extracurricular | Overall
    rating: int = Field(default=5, ge=1, le=5)
    comment: str
    createdAt: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))

class ReviewCreate(BaseModel):
    reviewer: str = "Administrator"
    category: str = "Academic"
    rating: int = Field(default=5, ge=1, le=5)
    comment: str
