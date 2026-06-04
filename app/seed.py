from __future__ import annotations

from datetime import date
from typing import Any

from app.database import SessionLocal, init_db
from app.models import AccountBalance, Debt, DebtType, IncomeFrequency, IncomeSource, InterestRate, ProjectionType, SavedProjection
from app.services.calculations import generate_baseline_projection, generate_scenario_projection, json_ready

START_MONTH = date(2026, 1, 1)
MONTHS = 60


def run() -> None:
    init_db()
    db = SessionLocal()
    try:
        _clear_existing_data(db)
        accounts = _create_accounts(db)
        income_sources = _create_income_sources(db, accounts)
        debts = _create_debts(db, accounts)
        interest_rates = _create_interest_rates(db, debts)
        db.flush()

        baseline = generate_baseline_projection(
            income_sources,
            debts,
            interest_rates,
            START_MONTH,
            months=MONTHS,
            account_balances=accounts.values(),
        )
        saved_baseline = _add_saved_projection(
            db,
            "Demo Household Baseline",
            ProjectionType.baseline,
            "Official Founded portfolio demo baseline.",
            baseline["assumptions_snapshot"],
            baseline["generated_rows"],
        )

        saved_scenarios = [
            _save_demo_scenario(
                db,
                saved_baseline,
                "Demo Debt Reduction Scenario",
                "Adds focused payoff dollars and trims one recurring bill.",
                income_overrides=[],
                debt_overrides=_debt_reduction_overrides(baseline["assumptions_snapshot"]),
            ),
            _save_demo_scenario(
                db,
                saved_baseline,
                "Demo Income Increase Scenario",
                "Models a promotion and a new monthly retainer.",
                income_overrides=_income_increase_overrides(baseline["assumptions_snapshot"], accounts),
                debt_overrides=[],
            ),
            _save_demo_scenario(
                db,
                saved_baseline,
                "Demo Emergency Expense Scenario",
                "Adds a one-time household repair expense.",
                income_overrides=[],
                debt_overrides=_emergency_expense_overrides(accounts),
            ),
        ]

        db.commit()
        print("Official demo dataset created.")
        for projection in [saved_baseline, *saved_scenarios]:
            first = projection.generated_rows[0]
            suffix = "+" if projection.projection_type == ProjectionType.scenario else ""
            print(
                f"{projection.title}: "
                f"surplus={first.get(f'Monthly Surplus{suffix}', first.get('Monthly Surplus'))}, "
                f"cash={first.get(f'Cash Balance{suffix}', first.get('Cash Balance'))}, "
                f"debt={first.get(f'Total Debt{suffix}', first.get('Total Debt'))}, "
                f"payments={first.get(f'Total Debt Payments{suffix}', first.get('Total Debt Payments'))}, "
                f"bills={first.get(f'Bills{suffix}', first.get('Bills'))}, "
                f"interest={first.get(f'Total Interest Charged{suffix}', first.get('Total Interest Charged'))}"
            )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _clear_existing_data(db) -> None:
    for model in (SavedProjection, InterestRate, Debt, IncomeSource, AccountBalance):
        db.query(model).delete()
    db.flush()


def _create_accounts(db) -> dict[str, AccountBalance]:
    accounts = {
        "primary": AccountBalance(
            name="Primary Checking",
            owner="Alex",
            account_type="Checking",
            amount=8200,
            date=START_MONTH,
            notes="Main household cash account",
        ),
        "emergency": AccountBalance(
            name="Emergency Savings",
            owner="Alex",
            account_type="Savings",
            amount=14500,
            date=START_MONTH,
            notes="Emergency reserve",
        ),
        "vacation": AccountBalance(
            name="Vacation Savings",
            owner="Jordan",
            account_type="Savings",
            amount=3600,
            date=START_MONTH,
            notes="Short-term travel fund",
        ),
        "joint": AccountBalance(
            name="Joint Checking",
            owner="Joint",
            account_type="Checking",
            amount=4100,
            date=START_MONTH,
            notes="Shared bills account",
        ),
    }
    db.add_all(accounts.values())
    db.flush()
    return accounts


def _create_income_sources(db, accounts: dict[str, AccountBalance]) -> list[IncomeSource]:
    sources = [
        IncomeSource(
            account_balance_id=accounts["primary"].id,
            label="Primary Salary",
            amount=6400,
            start_date=START_MONTH,
            frequency=IncomeFrequency.monthly,
            notes="Monthly net payroll",
        ),
        IncomeSource(
            account_balance_id=accounts["joint"].id,
            label="Partner Salary",
            amount=4200,
            start_date=START_MONTH,
            frequency=IncomeFrequency.monthly,
            notes="Monthly net payroll",
        ),
        IncomeSource(
            account_balance_id=accounts["primary"].id,
            label="Side Consulting",
            amount=850,
            start_date=date(2026, 2, 1),
            frequency=IncomeFrequency.monthly,
            notes="Recurring client retainer",
        ),
        IncomeSource(
            account_balance_id=accounts["emergency"].id,
            label="Annual Bonus",
            amount=3000,
            start_date=date(2026, 6, 1),
            frequency=IncomeFrequency.one_time,
            notes="One-time annual bonus",
        ),
        IncomeSource(
            is_account_transfer=True,
            from_account_id=accounts["primary"].id,
            to_account_id=accounts["vacation"].id,
            label="Vacation Savings Transfer",
            amount=300,
            start_date=START_MONTH,
            frequency=IncomeFrequency.monthly,
            notes="Monthly savings transfer",
        ),
    ]
    db.add_all(sources)
    db.flush()
    return sources


def _create_debts(db, accounts: dict[str, AccountBalance]) -> list[Debt]:
    debts = [
        Debt(
            account_balance_id=accounts["primary"].id,
            name="Travel Rewards Card",
            debt_type=DebtType.credit_card,
            starting_balance=4800,
            current_balance=4800,
            minimum_monthly_payment=125,
            planned_extra_payment=175,
            payment_date=date(2026, 1, 15),
            start_date=START_MONTH,
            priority_number=1,
            notes="High-interest card targeted first",
        ),
        Debt(
            account_balance_id=accounts["joint"].id,
            name="Family Auto Loan",
            debt_type=DebtType.vehicle_loan,
            starting_balance=18500,
            current_balance=18500,
            minimum_monthly_payment=435,
            planned_extra_payment=0,
            payment_date=date(2026, 1, 20),
            start_date=START_MONTH,
            priority_number=3,
        ),
        Debt(
            account_balance_id=accounts["primary"].id,
            name="Home Improvement Loan",
            debt_type=DebtType.personal_loan,
            starting_balance=9200,
            current_balance=9200,
            minimum_monthly_payment=285,
            planned_extra_payment=65,
            payment_date=date(2026, 1, 10),
            start_date=START_MONTH,
            priority_number=2,
        ),
        Debt(
            account_balance_id=accounts["joint"].id,
            name="Graduate Student Loan",
            debt_type=DebtType.student_loan,
            starting_balance=14200,
            current_balance=14200,
            minimum_monthly_payment=210,
            planned_extra_payment=0,
            payment_date=date(2026, 1, 5),
            start_date=START_MONTH,
            priority_number=4,
        ),
        Debt(
            account_balance_id=accounts["joint"].id,
            name="Utilities",
            debt_type=DebtType.other,
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=360,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=START_MONTH,
            notes="Monthly household utilities",
        ),
        Debt(
            account_balance_id=accounts["primary"].id,
            name="Streaming Services",
            debt_type=DebtType.other,
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=95,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=START_MONTH,
            notes="Recurring subscriptions",
        ),
        Debt(
            account_balance_id=accounts["primary"].id,
            name="Auto Insurance",
            debt_type=DebtType.other,
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=180,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=START_MONTH,
        ),
        Debt(
            account_balance_id=accounts["primary"].id,
            name="Warehouse Membership",
            debt_type=DebtType.other,
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=120,
            planned_extra_payment=0,
            recurrence="one_time",
            start_date=date(2026, 3, 1),
            notes="Annual membership renewal",
        ),
    ]
    db.add_all(debts)
    db.flush()
    return debts


def _create_interest_rates(db, debts: list[Debt]) -> list[InterestRate]:
    by_name = {debt.name: debt for debt in debts}
    rates = [
        InterestRate(
            debt_id=by_name["Travel Rewards Card"].id,
            apr_percentage=0,
            start_date=START_MONTH,
            end_date=date(2026, 4, 1),
            notes="Intro promotional APR",
        ),
        InterestRate(
            debt_id=by_name["Travel Rewards Card"].id,
            apr_percentage=22.99,
            start_date=date(2026, 5, 1),
            notes="Standard APR",
        ),
        InterestRate(
            debt_id=by_name["Family Auto Loan"].id,
            apr_percentage=6.4,
            start_date=START_MONTH,
        ),
        InterestRate(
            debt_id=by_name["Home Improvement Loan"].id,
            apr_percentage=10.75,
            start_date=START_MONTH,
        ),
        InterestRate(
            debt_id=by_name["Graduate Student Loan"].id,
            apr_percentage=5.25,
            start_date=START_MONTH,
        ),
    ]
    db.add_all(rates)
    db.flush()
    return rates


def _save_demo_scenario(
    db,
    baseline: SavedProjection,
    title: str,
    notes: str,
    *,
    income_overrides: list[dict[str, Any]],
    debt_overrides: list[dict[str, Any]],
) -> SavedProjection:
    generated = generate_scenario_projection(
        baseline.generated_rows,
        baseline.assumptions_snapshot,
        START_MONTH,
        income_overrides=income_overrides,
        debt_overrides=debt_overrides,
        interest_rate_overrides=[],
        months=MONTHS,
    )
    generated["assumptions_snapshot"]["baseline_projection_id"] = baseline.id
    generated["assumptions_snapshot"]["scenario_overrides"] = json_ready(
        {
            "income_overrides": income_overrides,
            "debt_overrides": debt_overrides,
            "interest_rate_overrides": [],
            "scenario_start_month": START_MONTH,
            "scenario_end_month": None,
            "months": MONTHS,
        }
    )
    return _add_saved_projection(
        db,
        title,
        ProjectionType.scenario,
        notes,
        generated["assumptions_snapshot"],
        generated["generated_rows"],
    )


def _add_saved_projection(
    db,
    title: str,
    projection_type: ProjectionType,
    notes: str,
    assumptions_snapshot: dict[str, Any],
    generated_rows: list[dict[str, Any]],
) -> SavedProjection:
    projection = SavedProjection(
        title=title,
        projection_type=projection_type,
        notes=notes,
        assumptions_snapshot=json_ready(assumptions_snapshot),
        generated_rows=json_ready(generated_rows),
    )
    db.add(projection)
    db.flush()
    return projection


def _debt_reduction_overrides(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    debts = {debt["name"]: dict(debt) for debt in snapshot["debts"]}
    travel_card = debts["Travel Rewards Card"]
    travel_card["planned_extra_payment"] = 475

    subscriptions = debts["Streaming Services"]
    subscriptions["minimum_monthly_payment"] = 60
    subscriptions["planned_extra_payment"] = 0

    return [travel_card, subscriptions]


def _income_increase_overrides(snapshot: dict[str, Any], accounts: dict[str, AccountBalance]) -> list[dict[str, Any]]:
    income = {source["label"]: dict(source) for source in snapshot["income_sources"]}
    primary_salary = income["Primary Salary"]
    primary_salary["amount"] = 7100

    return [
        primary_salary,
        {
            "account_balance_id": accounts["primary"].id,
            "is_account_transfer": False,
            "from_account_id": None,
            "to_account_id": None,
            "label": "Freelance Retainer",
            "amount": 1200,
            "start_date": date(2026, 4, 1),
            "end_date": None,
            "frequency": "monthly",
            "notes": "New recurring consulting agreement",
            "active": True,
        },
    ]


def _emergency_expense_overrides(accounts: dict[str, AccountBalance]) -> list[dict[str, Any]]:
    return [
        {
            "account_balance_id": accounts["emergency"].id,
            "id": None,
            "name": "Emergency Home Repair",
            "debt_type": "other",
            "starting_balance": 0,
            "current_balance": 0,
            "minimum_monthly_payment": 2400,
            "planned_extra_payment": 0,
            "recurrence": "one_time",
            "payment_due_day": None,
            "payment_date": None,
            "start_date": date(2026, 4, 1),
            "payoff_target_date": None,
            "priority_number": None,
            "active": True,
            "notes": "One-time emergency repair bill",
        }
    ]


if __name__ == "__main__":
    run()
