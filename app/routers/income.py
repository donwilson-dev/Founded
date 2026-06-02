from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import IncomeSource
from app.schemas import IncomeSourceCreate, IncomeSourceRead, IncomeSourceUpdate
from app.services.account_integrity import merged_values, validate_income_account_assignment

router = APIRouter(prefix="/income-sources", tags=["Income"])


@router.post("", response_model=IncomeSourceRead)
def create_income_source(payload: IncomeSourceCreate, db: Session = Depends(get_db)):
    values = payload.model_dump()
    validate_income_account_assignment(db, values)
    source = IncomeSource(**values)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.get("", response_model=list[IncomeSourceRead])
def list_income_sources(db: Session = Depends(get_db)):
    return db.query(IncomeSource).order_by(IncomeSource.id).all()


@router.get("/{income_source_id}", response_model=IncomeSourceRead)
def retrieve_income_source(income_source_id: int, db: Session = Depends(get_db)):
    source = db.get(IncomeSource, income_source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Income source not found")
    return source


@router.patch("/{income_source_id}", response_model=IncomeSourceRead)
def update_income_source(income_source_id: int, payload: IncomeSourceUpdate, db: Session = Depends(get_db)):
    source = db.get(IncomeSource, income_source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Income source not found")
    updates = payload.model_dump(exclude_unset=True)
    validate_income_account_assignment(db, merged_values(source, updates), source)
    for key, value in updates.items():
        setattr(source, key, value)
    if source.end_date and source.end_date < source.start_date:
        raise HTTPException(status_code=422, detail="end_date cannot be before start_date")
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{income_source_id}", status_code=204)
def delete_income_source(income_source_id: int, db: Session = Depends(get_db)):
    source = db.get(IncomeSource, income_source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Income source not found")
    db.delete(source)
    db.commit()
    return None
