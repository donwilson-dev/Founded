from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Debt
from app.schemas import DebtCreate, DebtRead, DebtUpdate
from app.services.account_integrity import merged_values, validate_debt_account_assignment

router = APIRouter(prefix="/debts", tags=["Debts"])


@router.post("", response_model=DebtRead)
def create_debt(payload: DebtCreate, db: Session = Depends(get_db)):
    values = payload.model_dump()
    validate_debt_account_assignment(db, values)
    debt = Debt(**values)
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return debt


@router.get("", response_model=list[DebtRead])
def list_debts(db: Session = Depends(get_db)):
    return db.query(Debt).options(selectinload(Debt.interest_rates)).order_by(Debt.id).all()


@router.get("/{debt_id}", response_model=DebtRead)
def retrieve_debt(debt_id: int, db: Session = Depends(get_db)):
    debt = db.query(Debt).options(selectinload(Debt.interest_rates)).filter(Debt.id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    return debt


@router.patch("/{debt_id}", response_model=DebtRead)
def update_debt(debt_id: int, payload: DebtUpdate, db: Session = Depends(get_db)):
    debt = db.get(Debt, debt_id)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    updates = payload.model_dump(exclude_unset=True)
    validate_debt_account_assignment(db, merged_values(debt, updates), debt)
    for key, value in updates.items():
        setattr(debt, key, value)
    if debt.payoff_target_date and debt.payoff_target_date < debt.start_date:
        raise HTTPException(status_code=422, detail="payoff_target_date cannot be before start_date")
    db.commit()
    db.refresh(debt)
    return debt


@router.delete("/{debt_id}", status_code=204)
def delete_debt(debt_id: int, db: Session = Depends(get_db)):
    debt = db.get(Debt, debt_id)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    db.delete(debt)
    db.commit()
    return None
