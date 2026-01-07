import os
from typing import Optional

class Settings:
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://mongodb:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "fretboard_db")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")
    API_PREFIX: str = os.getenv("API_PREFIX", "/api")
    
    @property
    def cors_origins_list(self) -> list:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

settings = Settings()
