from pydantic import BaseModel
from typing import List, Optional

class TimetablePeriod(BaseModel):
    period: str
    mon: str = "-"
    tue: str = "-"
    wed: str = "-"
    thu: str = "-"
    fri: str = "-"

class TimetableUpdate(BaseModel):
    standard: str
    schedule: List[TimetablePeriod]
