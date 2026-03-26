from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import stores, sellers, devices, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="VoiceIQ Admin Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)

app.include_router(stores.router)
app.include_router(sellers.router)
app.include_router(devices.router)
app.include_router(settings.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "admin-service"}
