from collections.abc import Generator
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


DATABASE_URL = "sqlite:///./founded.db"


class Base(DeclarativeBase):
    pass


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Path("founded.db").touch(exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    with engine.begin() as connection:
        if inspector.has_table("debts"):
            debt_columns = {column["name"] for column in inspector.get_columns("debts")}
            if "recurrence" not in debt_columns:
                connection.execute(text("ALTER TABLE debts ADD COLUMN recurrence VARCHAR(20)"))
            if "account_balance_id" not in debt_columns:
                connection.execute(text("ALTER TABLE debts ADD COLUMN account_balance_id INTEGER"))
            if "payment_date" not in debt_columns:
                connection.execute(text("ALTER TABLE debts ADD COLUMN payment_date DATE"))
        if inspector.has_table("income_sources"):
            income_columns = {column["name"] for column in inspector.get_columns("income_sources")}
            if "account_balance_id" not in income_columns:
                connection.execute(text("ALTER TABLE income_sources ADD COLUMN account_balance_id INTEGER"))
            if "is_account_transfer" not in income_columns:
                connection.execute(text("ALTER TABLE income_sources ADD COLUMN is_account_transfer BOOLEAN DEFAULT 0"))
            if "from_account_id" not in income_columns:
                connection.execute(text("ALTER TABLE income_sources ADD COLUMN from_account_id INTEGER"))
            if "to_account_id" not in income_columns:
                connection.execute(text("ALTER TABLE income_sources ADD COLUMN to_account_id INTEGER"))
        if inspector.has_table("account_balances"):
            account_columns = {column["name"] for column in inspector.get_columns("account_balances")}
            if "owner" not in account_columns:
                connection.execute(text("ALTER TABLE account_balances ADD COLUMN owner VARCHAR(120)"))
            if "account_type" not in account_columns:
                connection.execute(text("ALTER TABLE account_balances ADD COLUMN account_type VARCHAR(120)"))
