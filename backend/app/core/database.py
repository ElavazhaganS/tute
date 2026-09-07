import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from dotenv import load_dotenv

load_dotenv()

import certifi

# Accept both MONGODB_URI (standard Atlas naming) and MONGO_URI
MONGODB_URI = (
    os.getenv("MONGODB_URI") 
    or os.getenv("MONGO_URI") 
    or "mongodb://localhost:27017"
)
DATABASE_NAME = os.getenv("DATABASE_NAME", "schoolhub_db")

class MongoDBManager:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

db_manager = MongoDBManager()

async def connect_to_mongo():
    """Establish connection to MongoDB Atlas / Local MongoDB."""
    try:
        kwargs = {"serverSelectionTimeoutMS": 10000}
        if "mongodb+srv://" in MONGODB_URI or "ssl=true" in MONGODB_URI.lower() or "tls=true" in MONGODB_URI.lower():
            kwargs["tlsCAFile"] = certifi.where()

        db_manager.client = AsyncIOMotorClient(
            MONGODB_URI,
            **kwargs
        )
        db_manager.db = db_manager.client[DATABASE_NAME]
        masked_uri = MONGODB_URI.split("@")[-1] if "@" in MONGODB_URI else MONGODB_URI
        print(f"[MongoDB Atlas] Successfully connected to database: '{DATABASE_NAME}' via {masked_uri}")
    except Exception as e:
        print(f"[MongoDB Atlas] Connection failed: {e}")
        raise e

async def close_mongo_connection():
    """Close MongoDB connection gracefully."""
    if db_manager.client:
        db_manager.client.close()
        print("[MongoDB Atlas] Connection closed.")

def get_database() -> AsyncIOMotorDatabase:
    """Dependency injector for routes."""
    if db_manager.db is None and db_manager.client is not None:
        db_manager.db = db_manager.client[DATABASE_NAME]
    return db_manager.db
