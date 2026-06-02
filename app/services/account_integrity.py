from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AccountBalance, Debt, IncomeSource, SavedProjection


ACCOUNT_REFERENCE_MESSAGE = (
    "This account is currently referenced by existing records. "
    "Reassign or remove dependent records before deleting this account."
)


def merged_values(model: Any, updates: dict[str, Any]) -> dict[str, Any]:
    values = {
        "account_balance_id": getattr(model, "account_balance_id", None),
        "is_account_transfer": getattr(model, "is_account_transfer", False),
        "from_account_id": getattr(model, "from_account_id", None),
        "to_account_id": getattr(model, "to_account_id", None),
    }
    values.update(updates)
    return values


def validate_income_account_assignment(
    db: Session,
    values: dict[str, Any],
    existing: IncomeSource | None = None,
    existing_account_ids: set[int | None] | None = None,
) -> None:
    existing_ids = set()
    if existing:
        existing_ids = {
            existing.account_balance_id,
            existing.from_account_id,
            existing.to_account_id,
        }
    existing_ids.update(existing_account_ids or set())

    if values.get("is_account_transfer"):
        from_account_id = values.get("from_account_id")
        to_account_id = values.get("to_account_id")
        if not from_account_id:
            raise HTTPException(status_code=422, detail="From Account is required.")
        if not to_account_id:
            raise HTTPException(status_code=422, detail="To Account is required.")
        if same_id(from_account_id, to_account_id):
            raise HTTPException(status_code=422, detail="From Account and To Account must be different.")
        validate_selectable_account(db, from_account_id, "From Account", existing_ids)
        validate_selectable_account(db, to_account_id, "To Account", existing_ids)
        return

    account_id = values.get("account_balance_id")
    if not account_id:
        raise HTTPException(status_code=422, detail="Account is required.")
    validate_selectable_account(db, account_id, "Account", existing_ids)


def validate_debt_account_assignment(
    db: Session,
    values: dict[str, Any],
    existing: Debt | None = None,
    existing_account_ids: set[int | None] | None = None,
) -> None:
    existing_ids = {existing.account_balance_id} if existing else set()
    existing_ids.update(existing_account_ids or set())
    account_id = values.get("account_balance_id")
    if not account_id:
        raise HTTPException(status_code=422, detail="Account is required.")
    validate_selectable_account(db, account_id, "Account", existing_ids)


def validate_selectable_account(db: Session, account_id: int, label: str, existing_ids: set[int | None] | None = None) -> None:
    account = db.get(AccountBalance, account_id)
    if not account:
        raise HTTPException(status_code=422, detail=f"{label} is no longer available.")
    active = account.get("active", True) if isinstance(account, dict) else account.active
    if active is False and account_id not in (existing_ids or set()):
        raise HTTPException(status_code=422, detail=f"{label} must be an active account.")


def ensure_account_can_be_deleted(db: Session, account_id: int) -> None:
    if db.query(IncomeSource).filter(IncomeSource.account_balance_id == account_id).first():
        raise HTTPException(status_code=409, detail=ACCOUNT_REFERENCE_MESSAGE)
    if db.query(IncomeSource).filter(IncomeSource.from_account_id == account_id).first():
        raise HTTPException(status_code=409, detail=ACCOUNT_REFERENCE_MESSAGE)
    if db.query(IncomeSource).filter(IncomeSource.to_account_id == account_id).first():
        raise HTTPException(status_code=409, detail=ACCOUNT_REFERENCE_MESSAGE)
    if db.query(Debt).filter(Debt.account_balance_id == account_id).first():
        raise HTTPException(status_code=409, detail=ACCOUNT_REFERENCE_MESSAGE)

    for projection in db.query(SavedProjection).all():
        if snapshot_references_account(projection.assumptions_snapshot or {}, account_id):
            raise HTTPException(status_code=409, detail=ACCOUNT_REFERENCE_MESSAGE)


def snapshot_references_account(value: Any, account_id: int) -> bool:
    if isinstance(value, list):
        return any(snapshot_references_account(item, account_id) for item in value)
    if not isinstance(value, dict):
        return False

    for key in ("account_balance_id", "from_account_id", "to_account_id"):
        if same_id(value.get(key), account_id):
            return True
    return any(snapshot_references_account(item, account_id) for item in value.values())


def same_id(value: Any, expected: int) -> bool:
    try:
        return int(value) == int(expected)
    except (TypeError, ValueError):
        return False
