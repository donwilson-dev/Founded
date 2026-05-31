from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AccountBalance
from app.schemas import AccountBalanceCreate, AccountBalanceRead, AccountBalanceUpdate

router = APIRouter(prefix="/account-balances", tags=["Account Balances"])


@router.post("", response_model=AccountBalanceRead)
def create_account_balance(payload: AccountBalanceCreate, db: Session = Depends(get_db)):
    balance = AccountBalance(**payload.model_dump())
    db.add(balance)
    db.commit()
    db.refresh(balance)
    return balance


@router.get("", response_model=list[AccountBalanceRead])
def list_account_balances(db: Session = Depends(get_db)):
    return db.query(AccountBalance).order_by(AccountBalance.date.desc(), AccountBalance.id.desc()).all()


@router.get("/{account_balance_id}", response_model=AccountBalanceRead)
def retrieve_account_balance(account_balance_id: int, db: Session = Depends(get_db)):
    balance = db.get(AccountBalance, account_balance_id)
    if not balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    return balance


@router.patch("/{account_balance_id}", response_model=AccountBalanceRead)
def update_account_balance(account_balance_id: int, payload: AccountBalanceUpdate, db: Session = Depends(get_db)):
    balance = db.get(AccountBalance, account_balance_id)
    if not balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(balance, key, value)
    db.commit()
    db.refresh(balance)
    return balance


@router.delete("/{account_balance_id}", status_code=204)
def delete_account_balance(account_balance_id: int, db: Session = Depends(get_db)):
    balance = db.get(AccountBalance, account_balance_id)
    if not balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    db.delete(balance)
    db.commit()
    return None
