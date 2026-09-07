from pydantic import BaseModel
from typing import List

ALL_DEFAULT_STANDARDS = [
    "Pre-KG",
    "LKG",
    "UKG",
    "1st Standard",
    "2nd Standard",
    "3rd Standard",
    "4th Standard",
    "5th Standard",
    "6th Standard",
    "7th Standard",
    "8th Standard",
    "9th Standard",
    "10th Standard",
    "11th Standard",
    "12th Standard"
]

class StandardCreate(BaseModel):
    name: str

class StandardList(BaseModel):
    standards: List[str]
