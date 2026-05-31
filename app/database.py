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
    if not inspector.has_table("debts"):
        return
    debt_columns = {column["name"] for column in inspector.get_columns("debts")}
    with engine.begin() as connection:
        if "recurrence" not in debt_columns:
            connection.execute(text("ALTER TABLE debts ADD COLUMN recurrence VARCHAR(20)"))
