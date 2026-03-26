from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from app.routers import templates, assignments, for_seller


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="scripts-service", version="1.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

app.include_router(templates.router)
app.include_router(assignments.router)
app.include_router(for_seller.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
