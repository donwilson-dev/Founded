from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class DebtType(StrEnum):
    credit_card = "credit_card"
    personal_loan = "personal_loan"
    vehicle_loan = "vehicle_loan"
    student_loan = "student_loan"
    other = "other"


class IncomeFrequency(StrEnum):
    one_time = "one_time"
    weekly = "weekly"
    bi_weekly = "bi_weekly"
    first_and_fifteenth = "first_and_fifteenth"
    monthly = "monthly"


class DebtRecurrence(StrEnum):
    one_time = "one_time"
    weekly = "weekly"
    bi_weekly = "bi_weekly"
    first_and_fifteenth = "first_and_fifteenth"
    monthly = "monthly"


class ProjectionType(StrEnum):
    baseline = "baseline"
    scenario = "scenario"


class IncomeSource(Base):
    __tablename__ = "income_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    frequency: Mapped[IncomeFrequency] = mapped_column(Enum(IncomeFrequency), default=IncomeFrequency.monthly)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AccountBalance(Base):
    __tablename__ = "account_balances"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    debt_type: Mapped[DebtType] = mapped_column(Enum(DebtType), nullable=False)
    starting_balance: Mapped[float] = mapped_column(Float, nullable=False)
    current_balance: Mapped[float] = mapped_column(Float, nullable=False)
    minimum_monthly_payment: Mapped[float] = mapped_column(Float, nullable=False)
    planned_extra_payment: Mapped[float] = mapped_column(Float, default=0)
    recurrence: Mapped[DebtRecurrence | None] = mapped_column(Enum(DebtRecurrence), nullable=True)
    payment_due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    payoff_target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    interest_rates: Mapped[list["InterestRate"]] = relationship(
        back_populates="debt", cascade="all, delete-orphan", order_by="InterestRate.start_date"
    )


class InterestRate(Base):
    __tablename__ = "interest_rates"

    id: Mapped[int] = mapped_column(primary_key=True)
    debt_id: Mapped[int] = mapped_column(ForeignKey("debts.id", ondelete="CASCADE"), nullable=False)
    apr_percentage: Mapped[float] = mapped_column(Float, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    debt: Mapped[Debt] = relationship(back_populates="interest_rates")


class SavedProjection(Base):
    __tablename__ = "saved_projections"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    projection_type: Mapped[ProjectionType] = mapped_column(Enum(ProjectionType), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assumptions_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    generated_rows: Mapped[list] = mapped_column(JSON, nullable=False)
