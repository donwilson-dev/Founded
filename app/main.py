from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import account_balances, dashboard, debts, income, interest_rates, projections, scenario

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Founded Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(income.router)
app.include_router(account_balances.router)
app.include_router(debts.router)
app.include_router(interest_rates.router)
app.include_router(projections.router)
app.include_router(scenario.router)
app.include_router(dashboard.router)
