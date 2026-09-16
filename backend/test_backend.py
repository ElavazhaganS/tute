import asyncio
# pyrefly: ignore [missing-import]
from httpx import AsyncClient, ASGITransport
from main import app
from app.core.database import connect_to_mongo, close_mongo_connection, get_database
from app.core.seed import seed_initial_data

async def run_test():
    try:
        await connect_to_mongo()
        db = get_database()
        if db is not None:
            await seed_initial_data(db)
    except Exception as e:
        print(f"[Notice] Direct MongoDB connection attempt: {e}")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        print("1. Testing Root & Health Check...")
        res = await ac.get("/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print("   Health check OK")

        print("2. Testing Standards List (Pre-KG to 12th)...")
        res = await ac.get("/api/standards")
        assert res.status_code == 200, f"Standards failed: {res.text}"
        standards = res.json()
        assert len(standards) >= 15, f"Expected >=15 standards, got {len(standards)}"
        assert "Pre-KG" in standards and "12th Standard" in standards
        print(f"   Standards OK ({len(standards)} standards loaded)")

        print("3. Testing Staff Login...")
        res = await ac.post("/api/auth/staff-login", json={"username": "admin", "password": "admin"})
        assert res.status_code == 200 and res.json()["success"] is True
        print("   Staff Login OK")

        print("4. Testing Validation & Role-Guards on Student Creation...")
        test_roll = "TEST-9999"
        headers_admin = {"X-User-Role": "admin"}
        headers_student = {"X-User-Role": "student"}
        
        # Test Invalid Phone
        bad_phone_data = {
            "name": "Invalid Phone Student",
            "rollNumber": "BAD-PHONE-1",
            "standard": "10th Standard",
            "phone": "not-a-number"
        }
        res_bad_phone = await ac.post("/api/students", json=bad_phone_data, headers=headers_admin)
        assert res_bad_phone.status_code == 422, f"Expected 422 for bad phone, got {res_bad_phone.status_code}"
        print("   Phone number validation OK (rejected invalid phone)")

        # Test Valid Student with simplified parent details (Father/Mother Name & Phone)
        student_data = {
            "name": "Integration Tester",
            "rollNumber": test_roll,
            "studentId": f"STU-{test_roll}",
            "dob": "2010-05-15",
            "gender": "Male",
            "standard": "10th Standard",
            "section": "A",
            "group": "General",
            "admissionDate": "2023-06-01",
            "email": "tester@schoolhub.edu",
            "phone": "+91 98765 43210",
            "address": "99, Test Boulevard, Tech City",
            "feesStatus": "Partially Paid",
            "feesAmount": 25000,
            "feesPaid": 15000,
            "performanceComment": "Testing MongoDB pipeline",
            "parent": {
                "fatherName": "John Tester",
                "fatherPhone": "+91 98765 43211",
                "motherName": "Jane Tester",
                "motherPhone": "+91 98765 43212"
            }
        }
        # Verify student role is rejected
        res_reject = await ac.post("/api/students", json=student_data, headers=headers_student)
        assert res_reject.status_code == 403, f"Expected 403 for student role, got {res_reject.status_code}"

        # Clean up if existing
        await ac.delete(f"/api/students/{test_roll}", headers=headers_admin)

        # Create as admin
        res = await ac.post("/api/students", json=student_data, headers=headers_admin)
        assert res.status_code == 201, f"Student creation failed: {res.text}"
        res_json = res.json()
        assert res_json["success"] is True
        assert res_json["message"] == "Student added successfully"
        assert res_json["student"]["rollNumber"] == test_roll
        assert res_json["student"]["parent"]["fatherName"] == "John Tester"
        assert res_json["student"]["parent"]["fatherPhone"] == "+91 98765 43211"
        assert res_json["student"]["parent"]["motherName"] == "Jane Tester"
        assert res_json["student"]["parent"]["motherPhone"] == "+91 98765 43212"
        print("   Student Creation & MongoDB Storage OK")

        print("5. Testing Student Login & /me Endpoint...")
        res = await ac.post("/api/auth/student-login", json={"rollNumber": test_roll})
        assert res.status_code == 200 and res.json()["success"] is True
        res_me = await ac.get(f"/api/students/me/{test_roll}")
        assert res_me.status_code == 200 and res_me.json()["rollNumber"] == test_roll
        print("   Student Login & /me Endpoint OK")

        print("6. Testing Edit / Update Student in MongoDB...")
        update_payload = {
            "feesStatus": "Paid",
            "feesPaid": 25000,
            "parent": {
                "fatherName": "John Tester Updated",
                "fatherPhone": "+91 98765 99999",
                "motherName": "Jane Tester",
                "motherPhone": "+91 98765 43212"
            }
        }
        res_up = await ac.put(f"/api/students/{test_roll}", json=update_payload, headers=headers_admin)
        assert res_up.status_code == 200
        up_json = res_up.json()
        assert up_json["success"] is True
        assert up_json["student"]["parent"]["fatherPhone"] == "+91 98765 99999"
        assert up_json["student"]["feesStatus"] == "Paid"
        print("   Student & Parent Updates in MongoDB OK")

        print("7. Testing Attendance Toggle...")
        res = await ac.post("/api/students/attendance/toggle", json={
            "rollNumber": test_roll,
            "date": "2026-09-01",
            "status": "P"
        }, headers=headers_admin)
        assert res.status_code == 200 and res.json()["status"] == "P"
        print("   Attendance Toggle OK")

        print("8. Testing Marks Update...")
        res = await ac.put(f"/api/students/{test_roll}/marks", json={
            "testType": "monthly",
            "marks": {"english": 90, "math": 95, "science": 92, "history": 88}
        }, headers=headers_admin)
        assert res.status_code == 200
        print("   Marks Update OK")

        print("9. Testing Fees Update Endpoint (Advance Fee & Monthly Fees)...")
        res = await ac.put(f"/api/students/{test_roll}/fees", json={
            "advanceFee": "Paid",
            "month": "September",
            "monthStatus": "Paid"
        }, headers=headers_admin)
        assert res.status_code == 200
        # Check student fee update
        res_stud = await ac.get(f"/api/students/{test_roll}")
        stud_data = res_stud.json()
        assert stud_data.get("advanceFee") == "Paid"
        assert stud_data.get("monthlyFees", {}).get("September") == "Paid"
        print("   Fees Update (Advance & Monthly Fee) OK")

        print("10. Testing Student Reviews (Add, Edit, and Percentage)...")
        res_rev = await ac.post(f"/api/students/{test_roll}/reviews", json={
            "reviewer": "Principal",
            "testName": "Unit Test 1",
            "marks": 95,
            "maxMarks": 100,
            "category": "Academic",
            "rating": 5,
            "comment": "Outstanding test results across all modules."
        }, headers=headers_admin)
        assert res_rev.status_code == 200
        rev_json = res_rev.json()
        assert rev_json["percentage"] == 95.0
        assert rev_json["testName"] == "Unit Test 1"
        rev_id = rev_json["id"]

        # Test Editing Review
        res_rev_up = await ac.put(f"/api/students/{test_roll}/reviews/{rev_id}", json={
            "comment": "Updated comment: Exceptional analytical aptitude in Mathematics.",
            "marks": 98,
            "rating": 5
        }, headers=headers_admin)
        assert res_rev_up.status_code == 200
        rev_up_json = res_rev_up.json()
        assert rev_up_json["percentage"] == 98.0
        assert "Exceptional" in rev_up_json["comment"]
        print("   Reviews (Add, Edit, Save) OK")

        print("11. Testing Timetable 3 Periods (Period, Hour, Subject)...")
        res_tt = await ac.get("/api/timetables/10th Standard")
        assert res_tt.status_code == 200
        tt_list = res_tt.json()
        assert len(tt_list) == 3, f"Expected exactly 3 periods, got {len(tt_list)}"
        assert "hour" in tt_list[0] and "subject" in tt_list[0]
        # Test editing timetable
        updated_tt = [
            {"period": "1", "hour": "9:00 AM – 10:00 AM", "subject": "Advanced Mathematics"},
            {"period": "2", "hour": "10:00 AM – 11:00 AM", "subject": "General Science"},
            {"period": "3", "hour": "11:15 AM – 12:15 PM", "subject": "Computer Science"}
        ]
        res_tt_save = await ac.put("/api/timetables/10th Standard", json=updated_tt)
        assert res_tt_save.status_code == 200
        print("   Timetable 3 Periods & Editable Hour/Subject OK")

        print("12. Testing Exam Schedule Creation & Retrieval...")
        exam_data = {
            "testName": "Unit Test 1",
            "standard": "10th Standard",
            "subject": "Mathematics",
            "examDate": "2026-09-15",
            "startTime": "09:30 AM",
            "durationMinutes": 90,
            "maxMarks": 100
        }
        res_exam_create = await ac.post("/api/exams", json=exam_data, headers=headers_admin)
        assert res_exam_create.status_code == 201
        exam_id = res_exam_create.json()["id"]

        res = await ac.get("/api/exams")
        assert res.status_code == 200
        
        await ac.delete(f"/api/exams/{exam_id}", headers=headers_admin)
        print("   Exam Schedules OK")

        print("13. Testing Student Deletion from MongoDB...")
        res = await ac.delete(f"/api/students/{test_roll}", headers=headers_admin)
        assert res.status_code == 200
        del_json = res.json()
        assert del_json["success"] is True

        # Confirm deleted from MongoDB
        res_check = await ac.get(f"/api/students/{test_roll}")
        assert res_check.status_code == 404
        print("   Student Deletion & Verification OK")

        print("\n ALL 13 INTEGRATION, VALIDATION & MONGODB TESTS PASSED CLEANLY!")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_test())
