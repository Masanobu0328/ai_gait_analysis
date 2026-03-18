# -*- coding: utf-8 -*-
"""
Application configuration using pydantic-settings.
"""
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""
    
    # Base paths
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
    INPUT_DIR: Path = PROJECT_ROOT / "data" / "input"
    OUTPUT_DIR: Path = PROJECT_ROOT / "data" / "output"
    
    # Analysis script
    ANALYZE_SCRIPT: Path = PROJECT_ROOT / "analyze_all.py"
    
    # OpenAI settings
    OPENAI_API_KEY: str = ""
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
