from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from app.routers import templates, assignments, store_assignments, for_seller, upsell, library, test_script, versions, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="scripts-service", version="1.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

app.include_router(templates.router)
app.include_router(assignments.router)
app.include_router(store_assignments.router)
app.include_router(for_seller.router)
app.include_router(upsell.router)
app.include_router(library.router)
app.include_router(test_script.router)
app.include_router(versions.router)
app.include_router(analytics.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
