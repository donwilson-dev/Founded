# Founded Backend

Backend foundation for Founded, a financial planning app for income, debt, projections, scenarios, snowball payoff planning, and dashboard-ready data.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
uvicorn app.main:app --reload
```

API docs are available at `http://127.0.0.1:8000/docs`.

## Frontend

```powershell
cd frontend
npm install
npm run dev -- --port 5173
```

The React app runs at `http://127.0.0.1:5173` and talks to the FastAPI backend at `http://127.0.0.1:8000`.

## Test

```powershell
pytest
```

## Seed Data

```powershell
python -m app.seed
```
