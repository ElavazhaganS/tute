from motor.motor_asyncio import AsyncIOMotorDatabase
from app.routers.timetables import DEFAULT_TIMETABLE
from app.models.standard import ALL_DEFAULT_STANDARDS

INITIAL_STUDENTS = [
    {
        "studentId": "STU-1001",
        "rollNumber": "1001",
        "name": "Sarah Miller",
        "dob": "2010-04-12",
        "gender": "Female",
        "standard": "10th Standard",
        "section": "A",
        "group": "General",
        "admissionDate": "2022-06-01",
        "email": "sarah.miller@schoolhub.edu",
        "phone": "+91 98765 43210",
        "address": "12, Rosewood Avenue, Green Valley",
        "feesStatus": "Paid",
        "feesAmount": 25000.0,
        "feesPaid": 25000.0,
        "performanceComment": "Demonstrates exceptional aptitude in analytical problem solving.",
        "parent": {
            "fatherName": "Robert Miller",
            "fatherPhone": "+91 98401 23456",
            "fatherEmail": "robert.miller@email.com",
            "fatherOccupation": "Senior Architect",
            "motherName": "Eleanor Miller",
            "motherPhone": "+91 98401 65432",
            "motherEmail": "eleanor.miller@email.com",
            "motherOccupation": "Professor",
            "emergencyContactName": "Robert Miller",
            "emergencyContactRelation": "Father",
            "emergencyContactPhone": "+91 98401 23456",
            "address": {
                "street": "12, Rosewood Avenue",
                "city": "Chennai",
                "district": "Chennai",
                "state": "Tamil Nadu",
                "pincode": "600028"
            }
        },
        "marks": {
            "weekly": {"english": 88, "math": 94, "science": 96, "history": 85},
            "monthly": {"english": 90, "math": 98, "science": 95, "history": 89}
        },
        "attendance": {"2026-09-01": "P"},
        "reviews": [
            {
                "id": "rev-101",
                "reviewer": "Administrator",
                "category": "Academic",
                "rating": 5,
                "comment": "Consistently scores in the 90th percentile with excellent classroom engagement.",
                "createdAt": "2026-08-25 10:30"
            }
        ]
    },
    {
        "studentId": "STU-1002",
        "rollNumber": "1002",
        "name": "David Chen",
        "dob": "2010-09-18",
        "gender": "Male",
        "standard": "10th Standard",
        "section": "A",
        "group": "General",
        "admissionDate": "2022-06-01",
        "email": "david.chen@schoolhub.edu",
        "phone": "+91 98765 43211",
        "address": "45/2 Lakeview Cross Road",
        "feesStatus": "Partially Paid",
        "feesAmount": 25000.0,
        "feesPaid": 15000.0,
        "performanceComment": "Steady progress across all monthly evaluations.",
        "parent": {
            "fatherName": "Wei Chen",
            "fatherPhone": "+91 98402 34567",
            "fatherEmail": "wei.chen@email.com",
            "fatherOccupation": "Financial Analyst",
            "motherName": "Lin Chen",
            "motherPhone": "+91 98402 76543",
            "motherEmail": "lin.chen@email.com",
            "motherOccupation": "Software Engineer",
            "emergencyContactName": "Lin Chen",
            "emergencyContactRelation": "Mother",
            "emergencyContactPhone": "+91 98402 76543",
            "address": {
                "street": "45/2 Lakeview Cross Road",
                "city": "Chennai",
                "district": "Chennai",
                "state": "Tamil Nadu",
                "pincode": "600034"
            }
        },
        "marks": {
            "weekly": {"english": 76, "math": 84, "science": 80, "history": 72},
            "monthly": {"english": 82, "math": 88, "science": 85, "history": 79}
        },
        "attendance": {"2026-09-01": "P"},
        "reviews": [
            {
                "id": "rev-102",
                "reviewer": "Academic Coordinator",
                "category": "Behavior",
                "rating": 4,
                "comment": "Polite, punctual, and highly disciplined in all extracurricular activities.",
                "createdAt": "2026-08-28 14:15"
            }
        ]
    },
    {
        "studentId": "STU-1003",
        "rollNumber": "1003",
        "name": "Emma Watson",
        "dob": "2011-03-24",
        "gender": "Female",
        "standard": "9th Standard",
        "section": "B",
        "group": "General",
        "admissionDate": "2023-06-01",
        "email": "emma.watson@schoolhub.edu",
        "phone": "+91 98765 43212",
        "address": "88, Palm Meadows",
        "feesStatus": "Pending",
        "feesAmount": 22000.0,
        "feesPaid": 0.0,
        "performanceComment": "Active participant in creative discussions and language arts.",
        "parent": {
            "fatherName": "Chris Watson",
            "fatherPhone": "+91 98403 45678",
            "fatherEmail": "chris.watson@email.com",
            "fatherOccupation": "Business Owner",
            "motherName": "Jacqueline Watson",
            "motherPhone": "+91 98403 87654",
            "motherEmail": "jacqueline.watson@email.com",
            "motherOccupation": "Writer",
            "emergencyContactName": "Chris Watson",
            "emergencyContactRelation": "Father",
            "emergencyContactPhone": "+91 98403 45678",
            "address": {
                "street": "88, Palm Meadows",
                "city": "Chennai",
                "district": "Chennai",
                "state": "Tamil Nadu",
                "pincode": "600041"
            }
        },
        "marks": {
            "weekly": {"english": 92, "math": 70, "science": 75, "history": 94},
            "monthly": {"english": 95, "math": 74, "science": 78, "history": 96}
        },
        "attendance": {"2026-09-01": "P"},
        "reviews": []
    },
    {
        "studentId": "STU-1004",
        "rollNumber": "1004",
        "name": "Arjun Kumar",
        "dob": "2008-11-05",
        "gender": "Male",
        "standard": "12th Standard",
        "section": "A",
        "group": "Science",
        "admissionDate": "2024-06-01",
        "email": "arjun.kumar@schoolhub.edu",
        "phone": "+91 98765 43213",
        "address": "15/A, Sunrise Apartments, Anna Nagar",
        "feesStatus": "Paid",
        "feesAmount": 30000.0,
        "feesPaid": 30000.0,
        "performanceComment": "High distinction candidate for engineering entrance tests.",
        "parent": {
            "fatherName": "Suresh Kumar",
            "fatherPhone": "+91 98404 56789",
            "fatherEmail": "suresh.kumar@email.com",
            "fatherOccupation": "Civil Engineer",
            "motherName": "Geetha Kumar",
            "motherPhone": "+91 98404 98765",
            "motherEmail": "geetha.kumar@email.com",
            "motherOccupation": "School Principal",
            "emergencyContactName": "Suresh Kumar",
            "emergencyContactRelation": "Father",
            "emergencyContactPhone": "+91 98404 56789",
            "address": {
                "street": "15/A, Sunrise Apartments, Anna Nagar",
                "city": "Chennai",
                "district": "Chennai",
                "state": "Tamil Nadu",
                "pincode": "600040"
            }
        },
        "marks": {
            "weekly": {"english": 85, "math": 96, "science": 98, "history": 82},
            "monthly": {"english": 88, "math": 99, "science": 98, "history": 85}
        },
        "attendance": {"2026-09-01": "P"},
        "reviews": []
    }
]

INITIAL_EXAMS = [
    {
        "id": "ex-01",
        "testName": "First Term Examination",
        "standard": "10th Standard",
        "subject": "Mathematics",
        "examDate": "2026-09-15",
        "startTime": "09:30 AM",
        "durationMinutes": 90,
        "maxMarks": 100
    },
    {
        "id": "ex-02",
        "testName": "First Term Examination",
        "standard": "10th Standard",
        "subject": "General Science",
        "examDate": "2026-09-17",
        "startTime": "09:30 AM",
        "durationMinutes": 90,
        "maxMarks": 100
    },
    {
        "id": "ex-03",
        "testName": "Quarterly Assessment",
        "standard": "12th Standard",
        "subject": "Physics",
        "examDate": "2026-09-20",
        "startTime": "10:00 AM",
        "durationMinutes": 120,
        "maxMarks": 100
    }
]

async def seed_initial_data(db: AsyncIOMotorDatabase):
    """Seed initial standards, timetables, students, and exams if not present."""
    # 1. Standards (Pre-KG to 12th)
    existing_std = await db["config"].find_one({"type": "standards"})
    if not existing_std:
        await db["config"].insert_one({"type": "standards", "list": ALL_DEFAULT_STANDARDS})
        print(f"[MongoDB Seed] Seeded {len(ALL_DEFAULT_STANDARDS)} standards (Pre-KG to 12th).")

    # 2. Timetables
    existing_tt = await db["timetables"].find_one({"type": "schedule_store"})
    if not existing_tt:
        tt_data = {std: DEFAULT_TIMETABLE for std in ALL_DEFAULT_STANDARDS}
        tt_data["Default"] = DEFAULT_TIMETABLE
        await db["timetables"].insert_one({"type": "schedule_store", "data": tt_data})
        print("[MongoDB Seed] Seeded timetables for all standards.")

    # 3. Students - update or seed
    for s in INITIAL_STUDENTS:
        await db["students"].update_one(
            {"rollNumber": s["rollNumber"]},
            {"$set": s},
            upsert=True
        )
    print(f"[MongoDB Seed] Seeded/Updated {len(INITIAL_STUDENTS)} students with full parent details.")

    # 4. Exams
    exam_count = await db["exams"].count_documents({})
    if exam_count == 0:
        await db["exams"].insert_many(INITIAL_EXAMS)
        print(f"[MongoDB Seed] Seeded {len(INITIAL_EXAMS)} test schedules.")
