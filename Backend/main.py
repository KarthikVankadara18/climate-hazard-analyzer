import uvicorn
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.database import (
    connect_to_database,
    close_database_connection,
)
from app.limiter import limiter
from app.routes.weather import router as weather_router
from app.routes.analysis import router as analysis_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_database()

    try:
        yield
    finally:
        await close_database_connection()

app = FastAPI(
    title="ClimateWatch API",
    description="Climate Hazard Trend Analyzer",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
)
app.add_middleware(SlowAPIMiddleware)

frontend_url = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
).rstrip("/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

app.include_router(
    weather_router,
    prefix="/api/weather",
    tags=["Weather"],
)
app.include_router(
    analysis_router,
    prefix="/api/analysis",
    tags=["Analysis"],
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
