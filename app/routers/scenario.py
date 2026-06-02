from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ProjectionType, SavedProjection
from app.schemas import SavedProjectionRead, ScenarioGenerateRequest
from app.services.calculations import generate_baseline_projection, generate_scenario_projection, json_ready
from app.services.account_integrity import validate_debt_account_assignment, validate_income_account_assignment
from app.services.saved_projections import save_or_update_projection

router = APIRouter(prefix="/scenario", tags=["Scenario"])


def prepared_baseline_projection(baseline: SavedProjection) -> tuple[list[dict], dict]:
    if baseline.generated_rows:
        return baseline.generated_rows, baseline.assumptions_snapshot
    assumptions = baseline.assumptions_snapshot or {}
    if not any(assumptions.get(key) for key in ("income_sources", "debts", "account_balances")):
        raise HTTPException(status_code=400, detail="Selected baseline has no generated rows")
    generated = generate_baseline_projection(
        assumptions.get("income_sources", []),
        assumptions.get("debts", []),
        assumptions.get("interest_rates", []),
        date.today().replace(day=1),
        months=60,
        account_balances=assumptions.get("account_balances", []),
    )
    return generated["generated_rows"], generated["assumptions_snapshot"]


def baseline_start_month(baseline_rows: list[dict]):
    if not baseline_rows:
        raise HTTPException(status_code=400, detail="Selected baseline has no generated rows")
    return baseline_rows[0]["month"]


def validate_scenario_account_assignments(payload: ScenarioGenerateRequest, baseline_assumptions: dict):
    account_rows = baseline_assumptions.get("account_balances") or baseline_assumptions.get("baseline_assumptions", {}).get("account_balances", [])
    accounts = {int(account["id"]): account for account in account_rows if account.get("id") is not None}

    class SnapshotSession:
        def get(self, model, item_id):
            if model.__name__ != "AccountBalance":
                return None
            return accounts.get(int(item_id))

    snapshot_db = SnapshotSession()
    existing_account_ids = set(accounts)
    for income in payload.income_overrides or []:
        validate_income_account_assignment(snapshot_db, income.model_dump(), existing_account_ids=existing_account_ids)
    for debt in payload.debt_overrides or []:
        validate_debt_account_assignment(snapshot_db, debt.model_dump(), existing_account_ids=existing_account_ids)


@router.post("/generate")
def generate_scenario(payload: ScenarioGenerateRequest, db: Session = Depends(get_db)):
    baseline = db.get(SavedProjection, payload.baseline_projection_id)
    if not baseline:
        raise HTTPException(status_code=404, detail="Baseline projection not found")
    if baseline.projection_type != ProjectionType.baseline:
        raise HTTPException(status_code=400, detail="Scenario generation requires a saved baseline")
    baseline_rows, baseline_assumptions = prepared_baseline_projection(baseline)
    validate_scenario_account_assignments(payload, baseline_assumptions)
    generated = generate_scenario_projection(
        baseline_rows,
        baseline_assumptions,
        payload.scenario_start_month or baseline_start_month(baseline_rows),
        payload.income_overrides,
        payload.debt_overrides,
        payload.interest_rate_overrides,
        payload.months,
        payload.scenario_end_month,
    )
    generated["assumptions_snapshot"]["baseline_projection_id"] = baseline.id
    generated["assumptions_snapshot"]["scenario_overrides"] = json_ready({
        "income_overrides": payload.income_overrides or [],
        "debt_overrides": payload.debt_overrides or [],
        "interest_rate_overrides": payload.interest_rate_overrides or [],
        "scenario_start_month": payload.scenario_start_month,
        "scenario_end_month": payload.scenario_end_month,
        "months": payload.months,
    })
    return generated


@router.post("/save", response_model=SavedProjectionRead)
def save_scenario(payload: ScenarioGenerateRequest, db: Session = Depends(get_db)):
    baseline = db.get(SavedProjection, payload.baseline_projection_id)
    if not baseline:
        raise HTTPException(status_code=404, detail="Baseline projection not found")
    if baseline.projection_type != ProjectionType.baseline:
        raise HTTPException(status_code=400, detail="Scenario generation requires a saved baseline")
    baseline_rows, baseline_assumptions = prepared_baseline_projection(baseline)
    validate_scenario_account_assignments(payload, baseline_assumptions)
    generated = generate_scenario_projection(
        baseline_rows,
        baseline_assumptions,
        payload.scenario_start_month or baseline_start_month(baseline_rows),
        payload.income_overrides,
        payload.debt_overrides,
        payload.interest_rate_overrides,
        payload.months,
        payload.scenario_end_month,
    )
    generated["assumptions_snapshot"]["baseline_projection_id"] = baseline.id
    generated["assumptions_snapshot"]["scenario_overrides"] = json_ready({
        "income_overrides": payload.income_overrides or [],
        "debt_overrides": payload.debt_overrides or [],
        "interest_rate_overrides": payload.interest_rate_overrides or [],
        "scenario_start_month": payload.scenario_start_month,
        "scenario_end_month": payload.scenario_end_month,
        "months": payload.months,
    })
    return save_or_update_projection(
        db,
        title=payload.title or f"{baseline.title} Scenario",
        projection_type=ProjectionType.scenario,
        notes=payload.notes,
        assumptions_snapshot=generated["assumptions_snapshot"],
        generated_rows=generated["generated_rows"],
    )


@router.get("/{projection_id}", response_model=SavedProjectionRead)
def retrieve_scenario_projection(projection_id: int, db: Session = Depends(get_db)):
    projection = db.get(SavedProjection, projection_id)
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    if projection.projection_type != ProjectionType.scenario:
        raise HTTPException(status_code=400, detail="Projection is not a scenario")
    return projection
