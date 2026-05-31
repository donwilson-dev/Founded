from datetime import date

from app.database import SessionLocal, init_db
from app.models import Debt, DebtType, IncomeSource, InterestRate


def run() -> None:
    init_db()
    db = SessionLocal()
    try:
        if db.query(IncomeSource).count() or db.query(Debt).count():
            print("Seed skipped: income or debt records already exist.")
            return

        db.add_all(
            [
                IncomeSource(label="Primary Salary", amount=7200, start_date=date(2026, 1, 1), notes="Monthly net pay"),
                IncomeSource(label="Consulting", amount=900, start_date=date(2026, 2, 1), notes="Side income"),
            ]
        )
        debts = [
            Debt(
                name="Chase",
                debt_type=DebtType.credit_card,
                starting_balance=6200,
                current_balance=6200,
                minimum_monthly_payment=180,
                planned_extra_payment=120,
                payment_due_day=15,
                start_date=date(2026, 1, 1),
                priority_number=1,
                notes="Promo APR followed by standard APR",
            ),
            Debt(
                name="Personal Loan",
                debt_type=DebtType.personal_loan,
                starting_balance=9800,
                current_balance=9800,
                minimum_monthly_payment=310,
                planned_extra_payment=0,
                payment_due_day=3,
                start_date=date(2026, 1, 1),
                priority_number=2,
            ),
            Debt(
                name="Vehicle Loan",
                debt_type=DebtType.vehicle_loan,
                starting_balance=18500,
                current_balance=18500,
                minimum_monthly_payment=425,
                planned_extra_payment=75,
                payment_due_day=20,
                start_date=date(2026, 1, 1),
                priority_number=3,
            ),
        ]
        db.add_all(debts)
        db.flush()
        db.add_all(
            [
                InterestRate(
                    debt_id=debts[0].id,
                    apr_percentage=0,
                    start_date=date(2026, 1, 1),
                    end_date=date(2026, 6, 1),
                    notes="0% promotional APR",
                ),
                InterestRate(
                    debt_id=debts[0].id,
                    apr_percentage=24.99,
                    start_date=date(2026, 7, 1),
                    notes="Standard APR after promo expires",
                ),
                InterestRate(debt_id=debts[1].id, apr_percentage=10.5, start_date=date(2026, 1, 1)),
                InterestRate(debt_id=debts[2].id, apr_percentage=6.75, start_date=date(2026, 1, 1)),
            ]
        )
        db.commit()
        print("Seed data created.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
