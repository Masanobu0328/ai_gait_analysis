# -*- coding: utf-8 -*-
"""
Gait Analysis API - FastAPI Backend
Mobile-first API for gait analysis with video upload and AI reviews.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import analysis, results, reviews
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup: ensure directories exist
    settings.INPUT_DIR.mkdir(parents=True, exist_ok=True)
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    yield
    # Shutdown: cleanup if needed
    pass


app = FastAPI(
    title="Gait Analysis API",
    description="歩行解析AIバックエンド - 動画アップロード、解析、レビュー生成",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://10.20.16.68:3001",  # Mobile access
        "http://10.20.16.68:3000",
        "http://10.20.16.68:3100",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for video serving
if settings.OUTPUT_DIR.exists():
    app.mount(
        "/static/videos",
        StaticFiles(directory=str(settings.OUTPUT_DIR)),
        name="videos"
    )

# Routers
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(results.router, prefix="/api/v1/results", tags=["Results"])
app.include_router(reviews.router, prefix="/api/v1/reviews", tags=["Reviews"])


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Gait Analysis API is running"}


@app.get("/api/v1/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "input_dir_exists": settings.INPUT_DIR.exists(),
        "output_dir_exists": settings.OUTPUT_DIR.exists(),
    }
