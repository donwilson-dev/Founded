from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import AccountBalance, Debt, DebtType, IncomeSource, InterestRate


engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        income = IncomeSource(label="Salary", amount=5000, start_date=date(2026, 1, 1))
        debt = Debt(
            name="Chase",
            debt_type=DebtType.credit_card,
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=100,
            start_date=date(2026, 1, 1),
            priority_number=1,
        )
        db.add_all([income, debt])
        db.flush()
        db.add(InterestRate(debt_id=debt.id, apr_percentage=12, start_date=date(2026, 1, 1)))
        db.commit()
    finally:
        db.close()


def test_generate_save_and_retrieve_projection():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 3})
    assert generated.status_code == 200

    saved = client.post(
        "/projections",
        json={
            "title": "Baseline January",
            "projection_type": "baseline",
            "assumptions_snapshot": generated.json()["assumptions_snapshot"],
            "generated_rows": generated.json()["generated_rows"],
        },
    )
    assert saved.status_code == 200

    retrieved = client.get(f"/projections/{saved.json()['id']}")
    assert retrieved.status_code == 200
    assert retrieved.json()["title"] == "Baseline January"
    assert retrieved.json()["generated_rows"][0]["month"] == "2026-01-01"

    deleted = client.delete(f"/projections/{saved.json()['id']}")
    assert deleted.status_code == 204
    missing = client.get(f"/projections/{saved.json()['id']}")
    assert missing.status_code == 404


def test_account_owner_type_and_assignments_persist_in_projection_snapshot():
    account = client.post(
        "/account-balances",
        json={
            "name": "USAA Checking",
            "owner": "Don Wilson",
            "account_type": "Money Market",
            "amount": 5000,
            "date": "2026-01-01",
        },
    )
    assert account.status_code == 200
    account_id = account.json()["id"]

    income = client.post(
        "/income-sources",
        json={
            "account_balance_id": account_id,
            "label": "Military Pension",
            "amount": 1000,
            "start_date": "2026-01-01",
            "frequency": "monthly",
        },
    )
    assert income.status_code == 200
    transfer_income = client.post(
        "/income-sources",
        json={
            "label": "Account Transfer Setup",
            "amount": 2500,
            "start_date": "2026-01-01",
            "frequency": "monthly",
            "is_account_transfer": True,
            "from_account_id": account_id,
            "to_account_id": account_id,
        },
    )
    assert transfer_income.status_code == 200

    debt = client.post(
        "/debts",
        json={
            "account_balance_id": account_id,
            "name": "Truck Loan",
            "debt_type": "vehicle_loan",
            "starting_balance": 1000,
            "current_balance": 1000,
            "minimum_monthly_payment": 100,
            "planned_extra_payment": 0,
            "payment_date": "2026-01-15",
            "start_date": "2026-01-01",
            "priority_number": 1,
        },
    )
    assert debt.status_code == 200

    generated = client.post(
        "/projections/baseline/generate",
        json={
            "start_month": "2026-01-01",
            "months": 1,
            "account_balance_ids": [account_id],
            "income_source_ids": [income.json()["id"], transfer_income.json()["id"]],
            "debt_ids": [debt.json()["id"]],
        },
    )
    assert generated.status_code == 200
    snapshot = generated.json()["assumptions_snapshot"]

    assert snapshot["account_balances"][0]["owner"] == "Don Wilson"
    assert snapshot["account_balances"][0]["account_type"] == "Money Market"
    assert snapshot["income_sources"][0]["account_balance_id"] == account_id
    assert snapshot["income_sources"][1]["is_account_transfer"] is True
    assert snapshot["income_sources"][1]["from_account_id"] == account_id
    assert snapshot["income_sources"][1]["to_account_id"] == account_id
    assert snapshot["debts"][0]["account_balance_id"] == account_id
    assert snapshot["debts"][0]["payment_date"] == "2026-01-15"
    assert generated.json()["generated_rows"][0]["Income"] == 1000
    assert generated.json()["generated_rows"][0]["Cash Balance"] == 5900


def test_saving_baseline_with_same_title_overwrites_existing_projection():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 2}).json()
    first = client.post(
        "/projections",
        json={
            "title": "Actual",
            "projection_type": "baseline",
            "notes": "first",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        },
    )
    second = client.post(
        "/projections",
        json={
            "title": "Actual",
            "projection_type": "baseline",
            "notes": "second",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"][:1],
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["notes"] == "second"
    saved = client.get("/projections").json()
    baselines = [item for item in saved if item["projection_type"] == "baseline" and item["title"] == "Actual"]
    assert len(baselines) == 1


def test_generate_projection_can_be_scoped_to_selected_working_inputs():
    db = TestingSessionLocal()
    try:
        older_income = IncomeSource(label="Old Salary", amount=9999, start_date=date(2026, 1, 1))
        new_income = IncomeSource(label="New Salary", amount=1000, start_date=date(2026, 1, 1))
        old_balance = AccountBalance(name="Old Checking", amount=9000, date=date(2025, 12, 1))
        new_balance = AccountBalance(name="New Checking", amount=100, date=date(2025, 12, 1))
        db.add_all([older_income, new_income, old_balance, new_balance])
        db.flush()
        scoped_ids = {"income": new_income.id, "balance": new_balance.id}
        db.commit()
    finally:
        db.close()

    generated = client.post(
        "/projections/baseline/generate",
        json={
            "start_month": "2026-01-01",
            "months": 1,
            "account_balance_ids": [scoped_ids["balance"]],
            "income_source_ids": [scoped_ids["income"]],
            "debt_ids": [],
        },
    )

    assert generated.status_code == 200
    row = generated.json()["generated_rows"][0]
    assert row["Income"] == 1000
    assert row["Cash Balance"] == 1100
    assert "Chase" not in row


def test_other_debt_accepts_one_time_recurrence_and_blank_optional_fields():
    debt = client.post(
        "/debts",
        json={
            "name": "One-Time Fee",
            "debt_type": "other",
            "starting_balance": 300,
            "current_balance": 300,
            "minimum_monthly_payment": 300,
            "planned_extra_payment": 0,
            "recurrence": "one_time",
            "start_date": "2026-02-01",
            "payoff_target_date": None,
            "priority_number": None,
            "active": True,
            "notes": None,
        },
    )

    assert debt.status_code == 200
    generated = client.post(
        "/projections/baseline/generate",
        json={"start_month": "2026-02-01", "months": 2, "income_source_ids": [], "debt_ids": [debt.json()["id"]]},
    )
    assert generated.status_code == 200
    rows = generated.json()["generated_rows"]
    assert rows[0]["One-Time Fee Payment"] == 0
    assert rows[0]["One-Time Fee Bill"] == 300
    assert rows[0]["Bills"] == 300
    assert rows[0]["Total Debt Payments"] == 0
    assert rows[1]["One-Time Fee Payment"] == 0


def test_recurring_other_debts_accept_zero_balance_and_project_payments():
    monthly = client.post(
        "/debts",
        json={
            "name": "Monthly Zero Balance Obligation",
            "debt_type": "other",
            "starting_balance": 0,
            "current_balance": 0,
            "minimum_monthly_payment": 100,
            "planned_extra_payment": 0,
            "recurrence": "monthly",
            "start_date": "2026-05-01",
        },
    )
    weekly = client.post(
        "/debts",
        json={
            "name": "Weekly Zero Balance Obligation",
            "debt_type": "other",
            "starting_balance": 0,
            "current_balance": 0,
            "minimum_monthly_payment": 0,
            "planned_extra_payment": 100,
            "recurrence": "weekly",
            "start_date": "2026-05-01",
        },
    )
    first_fifteenth = client.post(
        "/debts",
        json={
            "name": "First Fifteenth Zero Balance Obligation",
            "debt_type": "other",
            "starting_balance": 0,
            "current_balance": 0,
            "minimum_monthly_payment": 100,
            "planned_extra_payment": 0,
            "recurrence": "first_and_fifteenth",
            "start_date": "2026-05-01",
        },
    )

    assert monthly.status_code == 200
    assert weekly.status_code == 200
    assert first_fifteenth.status_code == 200

    generated = client.post(
        "/projections/baseline/generate",
        json={
            "start_month": "2026-05-01",
            "months": 1,
            "income_source_ids": [],
            "debt_ids": [monthly.json()["id"], weekly.json()["id"], first_fifteenth.json()["id"]],
            "account_balance_ids": [],
        },
    )

    assert generated.status_code == 200
    row = generated.json()["generated_rows"][0]
    assert row["Monthly Zero Balance Obligation Payment"] == 0
    assert row["Weekly Zero Balance Obligation Payment"] == 0
    assert row["First Fifteenth Zero Balance Obligation Payment"] == 0
    assert row["Monthly Zero Balance Obligation Bill"] == 100
    assert row["Weekly Zero Balance Obligation Bill"] == 500
    assert row["First Fifteenth Zero Balance Obligation Bill"] == 200
    assert row["Bills"] == 800
    assert row["Total Debt Payments"] == 0
    assert row["Total Interest Charged"] == 0
    assert row["Total Debt"] == 0


def test_same_month_end_date_before_start_day_is_rejected_for_occurrence_model():
    income = client.post(
        "/income-sources",
        json={
            "label": "First Fifteenth",
            "amount": 2854,
            "start_date": "2026-01-15",
            "end_date": "2026-01-14",
            "frequency": "first_and_fifteenth",
            "active": True,
        },
    )
    debt = client.post(
        "/debts",
        json={
            "name": "First Fifteenth Fee",
            "debt_type": "other",
            "starting_balance": 1000,
            "current_balance": 1000,
            "minimum_monthly_payment": 285,
            "planned_extra_payment": 0,
            "recurrence": "first_and_fifteenth",
            "start_date": "2026-01-15",
            "payoff_target_date": "2026-01-14",
            "active": True,
        },
    )

    assert income.status_code == 422
    assert debt.status_code == 422


def test_first_fifteenth_end_date_cutoff_uses_exact_occurrence_dates():
    income = client.post(
        "/income-sources",
        json={
            "label": "First Fifteenth",
            "amount": 1000,
            "start_date": "2026-05-01",
            "end_date": "2026-07-14",
            "frequency": "first_and_fifteenth",
            "active": True,
        },
    )
    assert income.status_code == 200

    generated = client.post(
        "/projections/baseline/generate",
        json={"start_month": "2026-05-01", "months": 3, "income_source_ids": [income.json()["id"]], "debt_ids": []},
    )
    assert generated.status_code == 200
    rows = generated.json()["generated_rows"]
    assert rows[0]["Income"] == 2000
    assert rows[1]["Income"] == 2000
    assert rows[2]["Income"] == 1000


def test_scenario_endpoint_preserves_baseline_values():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 3}).json()
    saved = client.post(
        "/projections",
        json={
            "title": "Baseline",
            "projection_type": "baseline",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        },
    ).json()

    scenario = client.post(
        "/scenario/generate",
        json={
            "baseline_projection_id": saved["id"],
            "scenario_start_month": "2026-02-01",
            "income_overrides": [
                {"label": "Salary", "amount": 6000, "start_date": "2026-01-01", "active": True}
            ],
        },
    )
    assert scenario.status_code == 200
    feb = scenario.json()["generated_rows"][1]
    assert feb["Income"] == 5000
    assert feb["Income+"] == 6000


def test_scenario_endpoint_can_use_baseline_timeline_without_explicit_dates():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 3}).json()
    saved = client.post(
        "/projections",
        json={
            "title": "Baseline",
            "projection_type": "baseline",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        },
    ).json()

    scenario = client.post(
        "/scenario/generate",
        json={
            "baseline_projection_id": saved["id"],
            "income_overrides": [
                {"label": "Salary", "amount": 6000, "start_date": "2026-01-01", "active": True}
            ],
        },
    )

    assert scenario.status_code == 200
    january = scenario.json()["generated_rows"][0]
    assert january["Income+"] == 6000


def test_scenario_endpoint_recomputes_source_only_baseline_rows():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 3}).json()
    saved = client.post(
        "/projections",
        json={
            "title": "Source Only",
            "projection_type": "baseline",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": [],
        },
    ).json()

    scenario = client.post(
        "/scenario/generate",
        json={
            "baseline_projection_id": saved["id"],
            "income_overrides": [
                {"label": "Salary", "amount": 6000, "start_date": "2026-01-01", "active": True}
            ],
        },
    )

    assert scenario.status_code == 200
    rows = scenario.json()["generated_rows"]
    assert rows
    assert any("Income+" in row for row in rows)


def test_scenario_weekly_other_debt_aligns_with_baseline_without_debt_override():
    balance = client.post(
        "/account-balances",
        json={"name": "Checking", "amount": 5000, "date": "2026-05-01"},
    ).json()
    income = client.post(
        "/income-sources",
        json={"label": "Scenario Salary", "amount": 1000, "start_date": "2026-05-01", "frequency": "monthly"},
    ).json()
    debt = client.post(
        "/debts",
        json={
            "name": "Weekly Scenario Obligation",
            "debt_type": "other",
            "starting_balance": 4000,
            "current_balance": 4000,
            "minimum_monthly_payment": 500,
            "planned_extra_payment": 0,
            "recurrence": "weekly",
            "start_date": "2026-05-01",
        },
    ).json()
    generated = client.post(
        "/projections/baseline/generate",
        json={
            "start_month": "2026-05-01",
            "months": 2,
            "account_balance_ids": [balance["id"]],
            "income_source_ids": [income["id"]],
            "debt_ids": [debt["id"]],
        },
    ).json()
    saved = client.post(
        "/projections",
        json={
            "title": "Weekly Alignment Baseline",
            "projection_type": "baseline",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        },
    ).json()

    scenario = client.post(
        "/scenario/generate",
        json={
            "baseline_projection_id": saved["id"],
            "income_overrides": [
                {
                    "label": "Scenario Salary",
                    "amount": 1200,
                    "start_date": "2026-05-01",
                    "frequency": "monthly",
                }
            ],
        },
    )

    assert scenario.status_code == 200
    rows = scenario.json()["generated_rows"]
    assert rows[0]["Total Debt Payments"] == 0
    assert rows[0]["Total Debt Payments+"] == 0
    assert rows[0]["Bills"] == 2500
    assert rows[0]["Bills+"] == 2500
    assert rows[0]["Monthly Surplus"] == -1500
    assert rows[0]["Cash Balance"] == 3500
    assert rows[1]["Total Debt Payments"] == 0
    assert rows[1]["Total Debt Payments+"] == 0
    assert rows[1]["Bills"] == 2000
    assert rows[1]["Bills+"] == 2000
    assert rows[1]["Monthly Surplus"] == -1000
    assert rows[1]["Cash Balance"] == 2500


def test_saving_scenario_with_same_title_overwrites_existing_projection():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 3}).json()
    saved = client.post(
        "/projections",
        json={
            "title": "Baseline",
            "projection_type": "baseline",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        },
    ).json()
    payload = {
        "baseline_projection_id": saved["id"],
        "title": "Baseline Scenario",
        "income_overrides": [
            {"label": "Salary", "amount": 6000, "start_date": "2026-01-01", "active": True}
        ],
    }

    first = client.post("/scenario/save", json=payload)
    second = client.post("/scenario/save", json={**payload, "notes": "updated"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["notes"] == "updated"
    saved_items = client.get("/projections").json()
    scenarios = [item for item in saved_items if item["projection_type"] == "scenario" and item["title"] == "Baseline Scenario"]
    assert len(scenarios) == 1


def test_dashboard_endpoint_uses_saved_projection():
    generated = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 6}).json()
    saved = client.post(
        "/projections",
        json={
            "title": "Baseline",
            "projection_type": "baseline",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        },
    ).json()

    dashboard = client.post(f"/dashboard/{saved['id']}/summary", json={})
    assert dashboard.status_code == 200
    assert dashboard.json()["summary"]["total_debt_payments"] == generated["generated_rows"][0]["Total Debt Payments"]


def test_projection_requests_are_capped_at_25_years():
    projection = client.post("/projections/baseline/generate", json={"start_month": "2026-01-01", "months": 301})
    assert projection.status_code == 422

    long_range = client.post(
        "/projections/baseline/generate",
        json={"start_month": "2026-01-01", "end_month": "2052-01-01"},
    )
    assert long_range.status_code == 422
