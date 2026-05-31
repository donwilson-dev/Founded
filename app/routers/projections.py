from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import AccountBalance, Debt, IncomeSource, InterestRate, ProjectionType, SavedProjection
from app.schemas import ProjectionGenerateRequest, SaveProjectionRequest, SavedProjectionRead, SavedProjectionSummary
from app.services.calculations import generate_baseline_projection
from app.services.saved_projections import save_or_update_projection

router = APIRouter(prefix="/projections", tags=["Projections"])


def current_financial_inputs(
    db: Session,
    account_balance_ids: list[int] | None = None,
    income_source_ids: list[int] | None = None,
    debt_ids: list[int] | None = None,
):
    account_query = db.query(AccountBalance).order_by(AccountBalance.date.desc())
    income_query = db.query(IncomeSource).order_by(IncomeSource.id)
    debt_query = db.query(Debt).options(selectinload(Debt.interest_rates)).order_by(Debt.id)
    rate_query = db.query(InterestRate).order_by(InterestRate.start_date)
    if account_balance_ids is not None:
        account_query = account_query.filter(AccountBalance.id.in_(account_balance_ids))
    if income_source_ids is not None:
        income_query = income_query.filter(IncomeSource.id.in_(income_source_ids))
    if debt_ids is not None:
        debt_query = debt_query.filter(Debt.id.in_(debt_ids))
        rate_query = rate_query.filter(InterestRate.debt_id.in_(debt_ids))
    account_balances = account_query.all()
    income = income_query.all()
    debts = debt_query.all()
    rates = rate_query.all()
    return account_balances, income, debts, rates


@router.post("/baseline/generate")
def generate_baseline(payload: ProjectionGenerateRequest, db: Session = Depends(get_db)):
    account_balances, income, debts, rates = current_financial_inputs(
        db,
        payload.account_balance_ids,
        payload.income_source_ids,
        payload.debt_ids,
    )
    return generate_baseline_projection(
        income,
        debts,
        rates,
        payload.start_month,
        payload.months,
        payload.end_month,
        account_balances=account_balances,
    )


@router.post("", response_model=SavedProjectionRead)
def save_projection(payload: SaveProjectionRequest, db: Session = Depends(get_db)):
    return save_or_update_projection(
        db,
        title=payload.title,
        projection_type=payload.projection_type,
        notes=payload.notes,
        assumptions_snapshot=payload.assumptions_snapshot,
        generated_rows=payload.generated_rows,
    )


@router.get("", response_model=list[SavedProjectionSummary])
def list_saved_projections(db: Session = Depends(get_db)):
    return db.query(SavedProjection).order_by(SavedProjection.updated_at.desc()).all()


@router.get("/{projection_id}", response_model=SavedProjectionRead)
def retrieve_saved_projection(projection_id: int, db: Session = Depends(get_db)):
    projection = db.get(SavedProjection, projection_id)
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    return projection


@router.delete("/{projection_id}", status_code=204)
def delete_saved_projection(projection_id: int, db: Session = Depends(get_db)):
    projection = db.get(SavedProjection, projection_id)
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    db.delete(projection)
    db.commit()
    return None


@router.post("/baseline/generate-and-save", response_model=SavedProjectionRead)
def generate_and_save_baseline(
    payload: ProjectionGenerateRequest,
    title: str,
    notes: str | None = None,
    db: Session = Depends(get_db),
):
    account_balances, income, debts, rates = current_financial_inputs(db)
    generated = generate_baseline_projection(
        income,
        debts,
        rates,
        payload.start_month,
        payload.months,
        payload.end_month,
        account_balances=account_balances,
    )
    return save_or_update_projection(
        db,
        title=title,
        projection_type=ProjectionType.baseline,
        notes=notes,
        assumptions_snapshot=generated["assumptions_snapshot"],
        generated_rows=generated["generated_rows"],
    )
