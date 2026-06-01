from datetime import date as Date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import DebtRecurrence, DebtType, IncomeFrequency, ProjectionType

MAX_PROJECTION_MONTHS = 25 * 12


class DateRangeMixin(BaseModel):
    start_date: Date
    end_date: Date | None = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class IncomeSourceBase(DateRangeMixin):
    account_balance_id: int | None = None
    is_account_transfer: bool = False
    from_account_id: int | None = None
    to_account_id: int | None = None
    label: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0)
    frequency: IncomeFrequency = IncomeFrequency.monthly
    notes: str | None = None
    active: bool = True


class IncomeSourceCreate(IncomeSourceBase):
    pass


class IncomeSourceUpdate(BaseModel):
    account_balance_id: int | None = None
    is_account_transfer: bool | None = None
    from_account_id: int | None = None
    to_account_id: int | None = None
    label: str | None = Field(default=None, min_length=1, max_length=120)
    amount: float | None = Field(default=None, ge=0)
    start_date: Date | None = None
    end_date: Date | None = None
    frequency: IncomeFrequency | None = None
    notes: str | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class IncomeSourceRead(IncomeSourceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class AccountBalanceBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    owner: str | None = Field(default=None, max_length=120)
    account_type: str | None = Field(default=None, max_length=120)
    amount: float = Field(ge=0)
    date: Date
    notes: str | None = None
    active: bool = True


class AccountBalanceCreate(AccountBalanceBase):
    pass


class AccountBalanceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    owner: str | None = Field(default=None, max_length=120)
    account_type: str | None = Field(default=None, max_length=120)
    amount: float | None = Field(default=None, ge=0)
    date: Date | None = None
    notes: str | None = None
    active: bool | None = None


class AccountBalanceRead(AccountBalanceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DebtBase(BaseModel):
    account_balance_id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    debt_type: DebtType
    starting_balance: float = Field(ge=0)
    current_balance: float = Field(ge=0)
    minimum_monthly_payment: float = Field(ge=0)
    planned_extra_payment: float = Field(default=0, ge=0)
    recurrence: DebtRecurrence | None = None
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    payment_date: Date | None = None
    start_date: Date
    payoff_target_date: Date | None = None
    priority_number: int | None = Field(default=None, ge=1)
    active: bool = True
    notes: str | None = None

    @model_validator(mode="after")
    def validate_target_date(self):
        if self.payoff_target_date and self.payoff_target_date < self.start_date:
            raise ValueError("payoff_target_date cannot be before start_date")
        return self


class DebtCreate(DebtBase):
    pass


class ScenarioDebtOverride(DebtBase):
    id: int | None = None


class DebtUpdate(BaseModel):
    account_balance_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    debt_type: DebtType | None = None
    starting_balance: float | None = Field(default=None, ge=0)
    current_balance: float | None = Field(default=None, ge=0)
    minimum_monthly_payment: float | None = Field(default=None, ge=0)
    planned_extra_payment: float | None = Field(default=None, ge=0)
    recurrence: DebtRecurrence | None = None
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    payment_date: Date | None = None
    start_date: Date | None = None
    payoff_target_date: Date | None = None
    priority_number: int | None = Field(default=None, ge=1)
    active: bool | None = None
    notes: str | None = None


class InterestRateBase(DateRangeMixin):
    debt_id: int
    apr_percentage: float = Field(ge=0)
    notes: str | None = None


class InterestRateCreate(InterestRateBase):
    pass


class ScenarioInterestRateOverride(InterestRateBase):
    id: int | None = None


class InterestRateUpdate(BaseModel):
    apr_percentage: float | None = Field(default=None, ge=0)
    start_date: Date | None = None
    end_date: Date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class InterestRateRead(InterestRateBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DebtRead(DebtBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    interest_rates: list[InterestRateRead] = Field(default_factory=list)


class ProjectionGenerateRequest(BaseModel):
    start_month: Date
    months: int | None = Field(default=60, ge=1, le=MAX_PROJECTION_MONTHS)
    end_month: Date | None = None
    account_balance_ids: list[int] | None = None
    income_source_ids: list[int] | None = None
    debt_ids: list[int] | None = None

    @field_validator("start_month", "end_month")
    @classmethod
    def normalize_first_of_month(cls, value: Date | None) -> Date | None:
        if value is None:
            return value
        return value.replace(day=1)

    @model_validator(mode="after")
    def validate_projection_range(self):
        if self.end_month:
            month_count = (self.end_month.year - self.start_month.year) * 12 + (self.end_month.month - self.start_month.month) + 1
            if month_count > MAX_PROJECTION_MONTHS:
                raise ValueError("projection range cannot exceed 25 years")
        return self


class SaveProjectionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    projection_type: ProjectionType
    notes: str | None = None
    assumptions_snapshot: dict[str, Any]
    generated_rows: list[dict[str, Any]]


class SavedProjectionRead(SaveProjectionRequest):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class SavedProjectionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    projection_type: ProjectionType
    created_at: datetime
    updated_at: datetime
    notes: str | None = None


class ScenarioGenerateRequest(BaseModel):
    baseline_projection_id: int
    scenario_start_month: Date | None = None
    scenario_end_month: Date | None = None
    months: int | None = Field(default=None, ge=1, le=MAX_PROJECTION_MONTHS)
    income_overrides: list[IncomeSourceCreate] = Field(default_factory=list)
    debt_overrides: list[ScenarioDebtOverride] = Field(default_factory=list)
    interest_rate_overrides: list[ScenarioInterestRateOverride] = Field(default_factory=list)
    title: str | None = None
    notes: str | None = None

    @field_validator("scenario_start_month", "scenario_end_month")
    @classmethod
    def normalize_scenario_month(cls, value: Date | None) -> Date | None:
        if value is None:
            return value
        return value.replace(day=1)

    @model_validator(mode="after")
    def validate_scenario_date_range(self):
        if self.scenario_end_month and self.scenario_start_month and self.scenario_end_month < self.scenario_start_month:
            raise ValueError("scenario_end_month cannot be before scenario_start_month")
        if self.scenario_end_month and self.scenario_start_month:
            month_count = (
                (self.scenario_end_month.year - self.scenario_start_month.year) * 12
                + (self.scenario_end_month.month - self.scenario_start_month.month)
                + 1
            )
            if month_count > MAX_PROJECTION_MONTHS:
                raise ValueError("scenario range cannot exceed 25 years")
        return self


class DashboardRequest(BaseModel):
    pass
