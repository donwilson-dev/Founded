from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Debt, InterestRate
from app.schemas import InterestRateCreate, InterestRateRead, InterestRateUpdate

router = APIRouter(prefix="/interest-rates", tags=["Interest Rates"])


@router.post("", response_model=InterestRateRead)
def create_interest_rate(payload: InterestRateCreate, db: Session = Depends(get_db)):
    if not db.get(Debt, payload.debt_id):
        raise HTTPException(status_code=404, detail="Debt not found")
    rate = InterestRate(**payload.model_dump())
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.get("/debt/{debt_id}", response_model=list[InterestRateRead])
def list_interest_rates_for_debt(debt_id: int, db: Session = Depends(get_db)):
    if not db.get(Debt, debt_id):
        raise HTTPException(status_code=404, detail="Debt not found")
    return db.query(InterestRate).filter(InterestRate.debt_id == debt_id).order_by(InterestRate.start_date).all()


@router.patch("/{interest_rate_id}", response_model=InterestRateRead)
def update_interest_rate(interest_rate_id: int, payload: InterestRateUpdate, db: Session = Depends(get_db)):
    rate = db.get(InterestRate, interest_rate_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Interest rate not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rate, key, value)
    if rate.end_date and rate.end_date < rate.start_date:
        raise HTTPException(status_code=422, detail="end_date cannot be before start_date")
    db.commit()
    db.refresh(rate)
    return rate


@router.delete("/{interest_rate_id}", status_code=204)
def delete_interest_rate(interest_rate_id: int, db: Session = Depends(get_db)):
    rate = db.get(InterestRate, interest_rate_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Interest rate not found")
    db.delete(rate)
    db.commit()
    return None
