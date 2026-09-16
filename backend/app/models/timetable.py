from pydantic import BaseModel
from typing import List, Optional

class TimetablePeriod(BaseModel):
    period: str
    hour: str = ""
    subject: str = ""
    mon: Optional[str] = "-"
    tue: Optional[str] = "-"
    wed: Optional[str] = "-"
    thu: Optional[str] = "-"
    fri: Optional[str] = "-"

class TimetableUpdate(BaseModel):
    standard: str
    schedule: List[TimetablePeriod]
