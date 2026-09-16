from motor.motor_asyncio import AsyncIOMotorDatabase
from backend.app.models.standard import ALL_DEFAULT_STANDARDS

async def seed_initial_data(db: AsyncIOMotorDatabase):
    """Seed only system standards if not present. No hardcoded student or timetable data."""
    # 1. Standards (Pre-KG to 12th)
    existing_std = await db["config"].find_one({"type": "standards"})
    if not existing_std:
        await db["config"].insert_one({"type": "standards", "list": ALL_DEFAULT_STANDARDS})
        print(f"[MongoDB Seed] Seeded {len(ALL_DEFAULT_STANDARDS)} standards (Pre-KG to 12th).")

