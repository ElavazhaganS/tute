from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.database import connect_to_mongo, close_mongo_connection, get_database
from backend.app.core.seed import seed_initial_data
from backend.app.routers import students, standards, timetables, auth, exams, tests

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB Atlas & Seed Initial Data
    try:
        await connect_to_mongo()
        db = get_database()
        if db is not None:
            await seed_initial_data(db)
    except Exception as e:
        print(f"[Startup Warning] Could not initialize MongoDB: {e}")
        print("Please ensure your MONGODB_URI is correctly set in backend/.env")
    
    yield
    
    # Shutdown: Cleanly disconnect
    await close_mongo_connection()

app = FastAPI(
    title="SchoolHub Management API (MongoDB Atlas)",
    description="Full-stack educational management API with MongoDB Atlas persistence",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include All Feature Routers
app.include_router(auth.router)
app.include_router(students.router)
app.include_router(standards.router)
app.include_router(timetables.router)
app.include_router(exams.router)
app.include_router(tests.router)

@app.get("/")
def read_root():
    return {
        "app": "SchoolHub Management API",
        "status": "online",
        "database": "MongoDB Atlas",
        "docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
