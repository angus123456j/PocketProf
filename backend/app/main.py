import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings, setup_logging
from app.routes import ask, electron, health, hydra, lightning, parse, pulse

setup_logging()
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="PocketProf AI Voice Backend",
    description="Modular AI voice learning engine",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "null",
        "http://127.0.0.1",
        "http://localhost",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://pocket-prof.vercel.app",
    ],
    # Localhost (any port) + Vercel production and preview deployments
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://[\w-]+\.vercel\.app$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root() -> dict:
    """Root endpoint; use /health for status and /docs for API docs."""
    return {
        "service": "PocketProf AI Voice Backend",
        "docs": "/docs",
        "health": "/health",
    }


app.include_router(health.router)
app.include_router(ask.router)
app.include_router(pulse.router)
app.include_router(parse.router)
app.include_router(electron.router)
app.include_router(lightning.router)
app.include_router(hydra.router)

logger.info("PocketProf backend started — env=%s, port=%s", settings.APP_ENV, settings.PORT)
