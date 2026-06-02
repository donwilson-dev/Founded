from datetime import date
from types import SimpleNamespace

from app.services.calculations import (
    applicable_apr,
    calculate_payoff_metrics,
    generate_baseline_projection,
    generate_scenario_projection,
    generate_vehicle_loan_schedule,
)


def obj(**kwargs):
    return SimpleNamespace(**kwargs)


def sample_inputs():
    income = [
        obj(id=1, label="Salary", amount=5000, start_date=date(2026, 1, 1), end_date=None, active=True),
        obj(id=2, label="Side", amount=500, start_date=date(2026, 2, 1), end_date=None, active=True),
    ]
    debts = [
        obj(
            id=1,
            name="Chase",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=100,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        ),
        obj(
            id=2,
            name="Car",
            debt_type="vehicle_loan",
            starting_balance=2000,
            current_balance=2000,
            minimum_monthly_payment=300,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=2,
            active=True,
        ),
    ]
    rates = [
        obj(id=1, debt_id=1, apr_percentage=0, start_date=date(2026, 1, 1), end_date=date(2026, 1, 1)),
        obj(id=2, debt_id=1, apr_percentage=24, start_date=date(2026, 2, 1), end_date=None),
        obj(id=3, debt_id=2, apr_percentage=6, start_date=date(2026, 1, 1), end_date=None),
    ]
    return income, debts, rates


def test_monthly_projection_generation_and_payoff_stops_at_zero():
    income, debts, rates = sample_inputs()
    projection = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=8)
    rows = projection["generated_rows"]

    assert rows[0]["Income"] == 5000
    assert rows[1]["Income"] == 5500
    assert rows[-1]["Chase"] == 0
    assert rows[-1]["Chase Payment"] == 0
    assert any("Chase" in row["Debts Paid Off"] for row in rows)
    assert all(row["Total Debt"] >= 0 for row in rows)


def test_interest_rate_expiration_behavior():
    _, _, rates = sample_inputs()

    assert applicable_apr(1, rates, date(2026, 1, 1)) == 0
    assert applicable_apr(1, rates, date(2026, 2, 1)) == 24
    assert applicable_apr(999, rates, date(2026, 2, 1)) == 0


def test_promo_apr_takes_precedence_during_promo_range():
    rates = [
        obj(id=1, debt_id=1, apr_percentage=18, start_date=date(2026, 1, 1), end_date=None),
        obj(id=2, debt_id=1, apr_percentage=0, start_date=date(2026, 1, 1), end_date=date(2026, 3, 1)),
    ]

    assert applicable_apr(1, rates, date(2026, 2, 1)) == 0
    assert applicable_apr(1, rates, date(2026, 4, 1)) == 18


def test_recurring_income_counts_occurrences_inside_month():
    income = [
        obj(id=1, label="Weekly", amount=100, start_date=date(2026, 1, 1), end_date=None, frequency="weekly", active=True),
        obj(id=2, label="Biweekly", amount=100, start_date=date(2026, 1, 1), end_date=None, frequency="bi_weekly", active=True),
        obj(id=3, label="Twice Monthly", amount=200, start_date=date(2026, 1, 1), end_date=None, frequency="first_and_fifteenth", active=True),
    ]
    projection = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=1)

    assert projection["generated_rows"][0]["Income"] == 1200


def test_weekly_income_varies_by_monthly_occurrence_count():
    income = [obj(id=1, label="Weekly", amount=1000, start_date=date(2026, 5, 1), end_date=None, frequency="weekly", active=True)]

    projection = generate_baseline_projection(income, [], [], date(2026, 5, 1), months=3)
    rows = projection["generated_rows"]

    assert rows[0]["Income"] == 5000
    assert rows[1]["Income"] == 4000
    assert rows[2]["Income"] == 5000


def test_biweekly_income_varies_by_monthly_occurrence_count():
    income = [obj(id=1, label="Biweekly", amount=1000, start_date=date(2026, 5, 1), end_date=None, frequency="bi_weekly", active=True)]

    projection = generate_baseline_projection(income, [], [], date(2026, 5, 1), months=3)
    rows = projection["generated_rows"]

    assert rows[0]["Income"] == 3000
    assert rows[1]["Income"] == 2000
    assert rows[2]["Income"] == 2000


def test_one_time_income_only_applies_in_start_month():
    income = [
        obj(
            id=1,
            label="Bonus",
            amount=1200,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 4, 1),
            frequency="one_time",
            active=True,
        )
    ]

    projection = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=4)
    rows = projection["generated_rows"]

    assert rows[0]["Income"] == 0
    assert rows[1]["Income"] == 1200
    assert rows[2]["Income"] == 0
    assert rows[3]["Income"] == 0


def test_income_end_date_stops_income_after_end_month():
    income = [obj(id=1, label="Contract", amount=1000, start_date=date(2026, 1, 1), end_date=date(2026, 2, 1), active=True)]

    projection = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=3)

    assert projection["generated_rows"][0]["Income"] == 1000
    assert projection["generated_rows"][1]["Income"] == 1000
    assert projection["generated_rows"][2]["Income"] == 0


def test_first_fifteenth_income_counts_occurrences_before_end_date():
    income = [
        obj(
            id=1,
            label="First Fifteenth",
            amount=2854,
            start_date=date(2026, 5, 1),
            end_date=date(2026, 7, 14),
            frequency="first_and_fifteenth",
            active=True,
        )
    ]

    projection = generate_baseline_projection(income, [], [], date(2026, 5, 1), months=3)

    assert projection["generated_rows"][0]["Income"] == 5708
    assert projection["generated_rows"][1]["Income"] == 5708
    assert projection["generated_rows"][2]["Income"] == 2854


def test_other_debt_weekly_recurrence_counts_occurrences_and_ignores_interest_rates():
    debts = [
        obj(
            id=1,
            name="Weekly Obligation",
            debt_type="other",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="weekly",
            start_date=date(2026, 1, 1),
            priority_number=None,
            active=True,
        )
    ]
    rates = [obj(id=1, debt_id=1, apr_percentage=120, start_date=date(2026, 1, 1), end_date=None)]

    projection = generate_baseline_projection([], debts, rates, date(2026, 1, 1), months=1)
    row = projection["generated_rows"][0]

    assert row["Weekly Obligation Interest"] == 0
    assert row["Weekly Obligation Payment"] == 0
    assert row["Weekly Obligation Bill"] == 500
    assert row["Total Debt Payments"] == 0
    assert row["Bills"] == 500
    assert row["Total Debt"] == 0


def test_weekly_other_debt_scenario_matches_baseline_without_debt_deviation():
    income = [
        obj(id=1, label="Salary", amount=1000, start_date=date(2026, 5, 1), end_date=None, frequency="monthly", active=True)
    ]
    debts = [
        obj(
            id=1,
            name="Weekly Obligation",
            debt_type="other",
            starting_balance=4000,
            current_balance=4000,
            minimum_monthly_payment=500,
            planned_extra_payment=0,
            recurrence="weekly",
            start_date=date(2026, 5, 1),
            priority_number=None,
            active=True,
        )
    ]
    account_balances = [obj(id=1, name="Checking", amount=5000, date=date(2026, 5, 1), active=True)]
    baseline = generate_baseline_projection(
        income,
        debts,
        [],
        date(2026, 5, 1),
        months=2,
        account_balances=account_balances,
    )

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 5, 1),
        income_overrides=[
            obj(id=1, label="Salary", amount=1200, start_date=date(2026, 5, 1), end_date=None, frequency="monthly", active=True)
        ],
    )

    may = scenario["generated_rows"][0]
    june = scenario["generated_rows"][1]
    assert may["Total Debt Payments"] == 0
    assert may["Total Debt Payments+"] == 0
    assert may["Bills"] == 2500
    assert may["Bills+"] == 2500
    assert may["Weekly Obligation"] == may["Weekly Obligation+"]
    assert may["Monthly Surplus"] == -1500
    assert may["Cash Balance"] == 3500
    assert june["Total Debt Payments"] == 0
    assert june["Total Debt Payments+"] == 0
    assert june["Bills"] == 2000
    assert june["Bills+"] == 2000
    assert june["Weekly Obligation"] == june["Weekly Obligation+"]
    assert june["Monthly Surplus"] == -1000
    assert june["Cash Balance"] == 2500


def test_other_debt_first_and_fifteenth_recurrence_counts_occurrences():
    debts = [
        obj(
            id=1,
            name="Twice Monthly Obligation",
            debt_type="other",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="first_and_fifteenth",
            start_date=date(2026, 1, 1),
            priority_number=None,
            active=True,
        )
    ]

    projection = generate_baseline_projection([], debts, [], date(2026, 1, 1), months=1)

    assert projection["generated_rows"][0]["Twice Monthly Obligation Payment"] == 0
    assert projection["generated_rows"][0]["Twice Monthly Obligation Bill"] == 200
    assert projection["generated_rows"][0]["Total Debt Payments"] == 0
    assert projection["generated_rows"][0]["Bills"] == 200
    assert projection["generated_rows"][0]["Total Debt"] == 0


def test_recurring_other_debts_with_zero_balance_still_schedule_obligation_payments():
    debts = [
        obj(
            id=1,
            name="Monthly Obligation",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=date(2026, 5, 1),
            priority_number=None,
            active=True,
        ),
        obj(
            id=2,
            name="Weekly Obligation",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="weekly",
            start_date=date(2026, 5, 1),
            priority_number=None,
            active=True,
        ),
        obj(
            id=3,
            name="Bi Weekly Obligation",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="bi_weekly",
            start_date=date(2026, 5, 1),
            priority_number=None,
            active=True,
        ),
        obj(
            id=4,
            name="First Fifteenth Obligation",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="first_and_fifteenth",
            start_date=date(2026, 5, 1),
            priority_number=None,
            active=True,
        ),
    ]

    projection = generate_baseline_projection([], debts, [], date(2026, 5, 1), months=1)
    row = projection["generated_rows"][0]

    assert row["Monthly Obligation Payment"] == 0
    assert row["Weekly Obligation Payment"] == 0
    assert row["Bi Weekly Obligation Payment"] == 0
    assert row["First Fifteenth Obligation Payment"] == 0
    assert row["Monthly Obligation Bill"] == 100
    assert row["Weekly Obligation Bill"] == 500
    assert row["Bi Weekly Obligation Bill"] == 300
    assert row["First Fifteenth Obligation Bill"] == 200
    assert row["Total Debt Payments"] == 0
    assert row["Bills"] == 1100
    assert row["Total Debt"] == 0
    assert row["Monthly Surplus"] == -1100


def test_bills_reduce_surplus_without_affecting_payoff_metrics():
    income = [obj(id=1, label="Salary", amount=1000, start_date=date(2026, 5, 1), end_date=None, active=True)]
    bills = [
        obj(
            id=1,
            name="Utility Bill",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=date(2026, 5, 1),
            priority_number=None,
            active=True,
        )
    ]
    account_balances = [obj(id=1, name="Checking", amount=5000, date=date(2026, 5, 1), active=True)]

    projection = generate_baseline_projection(income, bills, [], date(2026, 5, 1), months=1, account_balances=account_balances)
    row = projection["generated_rows"][0]

    assert row["Bills"] == 100
    assert row["Total Debt Payments"] == 0
    assert row["Total Interest Charged"] == 0
    assert row["Total Debt"] == 0
    assert row["Debts Paid Off"] == []
    assert row["Monthly Surplus"] == 900
    assert row["Cash Balance"] == 5900
    assert projection["summary"]["payoff_status"] == "no_active_debt"
    assert projection["summary"]["projected_payoff_date"] is None


def test_duplicate_debt_names_get_distinct_projection_columns():
    income = [obj(id=1, label="Salary", amount=1000, start_date=date(2026, 5, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Citi",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=140,
            planned_extra_payment=0,
            start_date=date(2026, 5, 1),
            priority_number=1,
            active=True,
        ),
        obj(
            id=2,
            name="Citi",
            debt_type="personal_loan",
            starting_balance=2000,
            current_balance=2000,
            minimum_monthly_payment=250,
            planned_extra_payment=0,
            start_date=date(2026, 5, 1),
            priority_number=2,
            active=True,
        ),
        obj(
            id=3,
            name="Citi",
            debt_type="credit_card",
            starting_balance=3000,
            current_balance=3000,
            minimum_monthly_payment=250,
            planned_extra_payment=0,
            start_date=date(2026, 5, 1),
            priority_number=3,
            active=True,
        ),
    ]

    projection = generate_baseline_projection(income, debts, [], date(2026, 5, 1), months=1)
    row = projection["generated_rows"][0]

    assert "Citi (Credit Card - $140/mo)" in row
    assert "Citi (Personal Loan)" in row
    assert "Citi (Credit Card - $250/mo)" in row
    assert "Citi" not in row
    labels = [debt["_projection_label"] for debt in projection["assumptions_snapshot"]["debts"]]
    assert labels == ["Citi (Credit Card - $140/mo)", "Citi (Personal Loan)", "Citi (Credit Card - $250/mo)"]


def test_other_debt_one_time_recurrence_applies_once_only():
    debts = [
        obj(
            id=1,
            name="One Time Obligation",
            debt_type="other",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=250,
            planned_extra_payment=0,
            recurrence="one_time",
            start_date=date(2026, 2, 1),
            payoff_target_date=None,
            priority_number=None,
            active=True,
        )
    ]

    projection = generate_baseline_projection([], debts, [], date(2026, 1, 1), months=4)
    rows = projection["generated_rows"]

    assert rows[0]["One Time Obligation Payment"] == 0
    assert rows[1]["One Time Obligation Payment"] == 0
    assert rows[1]["One Time Obligation Bill"] == 250
    assert rows[1]["Bills"] == 250
    assert rows[2]["One Time Obligation Payment"] == 0
    assert rows[3]["One Time Obligation Payment"] == 0
    assert rows[2]["One Time Obligation"] == 0


def test_other_debt_recurring_end_date_stops_payment_after_end_month():
    debts = [
        obj(
            id=1,
            name="Temporary Obligation",
            debt_type="other",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=date(2026, 1, 1),
            payoff_target_date=date(2026, 2, 1),
            priority_number=None,
            active=True,
        )
    ]

    projection = generate_baseline_projection([], debts, [], date(2026, 1, 1), months=4)
    rows = projection["generated_rows"]

    assert rows[0]["Temporary Obligation Payment"] == 0
    assert rows[0]["Temporary Obligation Bill"] == 100
    assert rows[1]["Temporary Obligation Payment"] == 0
    assert rows[1]["Temporary Obligation Bill"] == 100
    assert rows[2]["Temporary Obligation Payment"] == 0
    assert rows[3]["Temporary Obligation Payment"] == 0
    assert rows[2]["Temporary Obligation"] == 0


def test_other_debt_first_fifteenth_end_date_cuts_off_second_occurrence():
    debts = [
        obj(
            id=1,
            name="First Fifteenth Obligation",
            debt_type="other",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=285,
            planned_extra_payment=0,
            recurrence="first_and_fifteenth",
            start_date=date(2026, 1, 1),
            payoff_target_date=date(2026, 1, 14),
            priority_number=None,
            active=True,
        )
    ]

    projection = generate_baseline_projection([], debts, [], date(2026, 1, 1), months=2)

    assert projection["generated_rows"][0]["First Fifteenth Obligation Payment"] == 0
    assert projection["generated_rows"][0]["First Fifteenth Obligation Bill"] == 285
    assert projection["generated_rows"][1]["First Fifteenth Obligation Payment"] == 0


def test_account_balance_sets_starting_cash_position():
    income = [obj(id=1, account_balance_id=1, label="Salary", amount=1000, start_date=date(2026, 1, 1), end_date=None, active=True)]
    account_balances = [obj(id=1, name="Checking", owner="don", account_type="checking", amount=500, date=date(2025, 12, 15), active=True)]

    projection = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=2, account_balances=account_balances)
    rows = projection["generated_rows"]

    assert rows[0]["Cash Balance"] == 1500
    assert rows[1]["Cash Balance"] == 2500
    assert projection["assumptions_snapshot"]["account_balances"][0]["name"] == "Checking"
    assert projection["assumptions_snapshot"]["account_balances"][0]["owner"] == "don"
    assert projection["assumptions_snapshot"]["account_balances"][0]["account_type"] == "checking"
    assert projection["assumptions_snapshot"]["income_sources"][0]["account_balance_id"] == 1


def test_account_projection_allocates_monthly_activity_and_reconciles_to_overall_cash():
    income = [
        obj(
            id=1,
            account_balance_id=1,
            label="Salary",
            amount=1000,
            start_date=date(2026, 1, 1),
            end_date=None,
            frequency="monthly",
            active=True,
        ),
        obj(
            id=2,
            label="Household Transfer",
            amount=200,
            start_date=date(2026, 1, 1),
            end_date=None,
            frequency="monthly",
            is_account_transfer=True,
            from_account_id=1,
            to_account_id=2,
            active=True,
        ),
    ]
    debts = [
        obj(
            id=1,
            account_balance_id=1,
            name="Card",
            debt_type="credit_card",
            starting_balance=300,
            current_balance=300,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        ),
        obj(
            id=2,
            account_balance_id=2,
            name="Utility",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=50,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=date(2026, 1, 1),
            priority_number=None,
            active=True,
        ),
    ]
    account_balances = [
        obj(id=1, name="Don Checking", owner="Don", account_type="Checking", amount=1000, date=date(2026, 1, 1), active=True),
        obj(id=2, name="Joint Checking", owner="Joint", account_type="Checking", amount=500, date=date(2026, 1, 1), active=True),
    ]

    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=1, account_balances=account_balances)
    account_row = projection["account_projection_rows"][0]
    don = next(account for account in account_row["accounts"] if account["account_balance_id"] == 1)
    joint = next(account for account in account_row["accounts"] if account["account_balance_id"] == 2)

    assert projection["generated_rows"][0]["Cash Balance"] == 2350
    assert account_row["total_cash_balance"] == projection["generated_rows"][0]["Cash Balance"]
    assert don["income"] == 1000
    assert don["debt_payments"] == 100
    assert don["transfers_out"] == 200
    assert don["cash_balance"] == 1700
    assert joint["bills"] == 50
    assert joint["transfers_in"] == 200
    assert joint["cash_balance"] == 650
    assert projection["assumptions_snapshot"]["_account_projection_rows"][0]["total_cash_balance"] == 2350


def test_account_projection_transfer_recurrence_moves_cash_without_changing_overall_totals():
    income = [
        obj(
            id=1,
            label="Weekly Transfer",
            amount=100,
            start_date=date(2026, 1, 1),
            end_date=None,
            frequency="weekly",
            is_account_transfer=True,
            from_account_id=1,
            to_account_id=2,
            active=True,
        )
    ]
    account_balances = [
        obj(id=1, name="Don Checking", owner="Don", account_type="Checking", amount=1000, date=date(2026, 1, 1), active=True),
        obj(id=2, name="Joint Checking", owner="Joint", account_type="Checking", amount=0, date=date(2026, 1, 1), active=True),
    ]

    projection = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=1, account_balances=account_balances)
    account_row = projection["account_projection_rows"][0]
    don = next(account for account in account_row["accounts"] if account["account_balance_id"] == 1)
    joint = next(account for account in account_row["accounts"] if account["account_balance_id"] == 2)

    assert projection["generated_rows"][0]["Income"] == 0
    assert projection["generated_rows"][0]["Monthly Surplus"] == 0
    assert projection["generated_rows"][0]["Cash Balance"] == 1000
    assert don["transfers_out"] == 500
    assert don["cash_balance"] == 500
    assert joint["transfers_in"] == 500
    assert joint["cash_balance"] == 500
    assert account_row["total_cash_balance"] == 1000
    owner_totals = {}
    for account in account_row["accounts"]:
        owner_totals[account["owner"]] = owner_totals.get(account["owner"], 0) + account["cash_balance"]
    assert owner_totals["Don"] == 500
    assert owner_totals["Joint"] == 500
    assert sum(owner_totals.values()) == projection["generated_rows"][0]["Cash Balance"]


def test_same_owner_transfer_preserves_owner_rollup_cash_balance():
    income = [
        obj(
            id=1,
            label="Don Transfer",
            amount=250,
            start_date=date(2026, 1, 1),
            end_date=None,
            frequency="monthly",
            is_account_transfer=True,
            from_account_id=1,
            to_account_id=2,
            active=True,
        )
    ]
    account_balances = [
        obj(id=1, name="Don Checking", owner="Don", account_type="Checking", amount=1000, date=date(2026, 1, 1), active=True),
        obj(id=2, name="Don Savings", owner="Don", account_type="Savings", amount=100, date=date(2026, 1, 1), active=True),
    ]

    projection = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=1, account_balances=account_balances)
    account_row = projection["account_projection_rows"][0]
    don_checking = next(account for account in account_row["accounts"] if account["account_balance_id"] == 1)
    don_savings = next(account for account in account_row["accounts"] if account["account_balance_id"] == 2)
    owner_total = sum(account["cash_balance"] for account in account_row["accounts"] if account["owner"] == "Don")

    assert don_checking["cash_balance"] == 750
    assert don_savings["cash_balance"] == 350
    assert owner_total == 1100
    assert account_row["total_cash_balance"] == projection["generated_rows"][0]["Cash Balance"]


def test_scenario_account_projection_tracks_transfers_without_changing_scenario_overall_cash():
    income = [
        obj(
            id=1,
            account_balance_id=1,
            label="Salary",
            amount=1000,
            start_date=date(2026, 1, 1),
            end_date=None,
            frequency="monthly",
            active=True,
        )
    ]
    account_balances = [
        obj(id=1, name="Don Checking", owner="Don", account_type="Checking", amount=1000, date=date(2026, 1, 1), active=True),
        obj(id=2, name="Joint Checking", owner="Joint", account_type="Checking", amount=0, date=date(2026, 1, 1), active=True),
    ]
    baseline = generate_baseline_projection(income, [], [], date(2026, 1, 1), months=1, account_balances=account_balances)

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 1, 1),
        income_overrides=[
            obj(
                id=2,
                label="Scenario Transfer",
                amount=300,
                start_date=date(2026, 1, 1),
                end_date=None,
                frequency="monthly",
                is_account_transfer=True,
                from_account_id=1,
                to_account_id=2,
                active=True,
            )
        ],
    )
    scenario_account_row = scenario["scenario_account_projection_rows"][0]
    don = next(account for account in scenario_account_row["accounts"] if account["account_balance_id"] == 1)
    joint = next(account for account in scenario_account_row["accounts"] if account["account_balance_id"] == 2)

    assert scenario["generated_rows"][0]["Cash Balance+"] == baseline["generated_rows"][0]["Cash Balance"]
    assert scenario_account_row["total_cash_balance"] == scenario["generated_rows"][0]["Cash Balance+"]
    assert don["cash_balance"] == 1700
    assert joint["cash_balance"] == 300
    assert scenario["assumptions_snapshot"]["_scenario_account_projection_rows"][0]["total_cash_balance"] == 2000


def test_cash_balance_subtracts_actual_debt_payments_from_income():
    income = [obj(id=1, label="Salary", amount=1000, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Card",
            debt_type="credit_card",
            starting_balance=500,
            current_balance=500,
            minimum_monthly_payment=100,
            planned_extra_payment=50,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]
    account_balances = [obj(id=1, name="Checking", amount=200, date=date(2025, 12, 1), active=True)]

    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=1, account_balances=account_balances)
    row = projection["generated_rows"][0]

    assert row["Card Payment"] == 150
    assert row["Total Debt Payments"] == 150
    assert row["Monthly Surplus"] == 850
    assert row["Cash Balance"] == 1050


def test_projected_payoff_date_can_extend_beyond_visible_rows():
    income = [obj(id=1, label="Salary", amount=100, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Long Debt",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]

    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=3)

    assert len(projection["generated_rows"]) == 3
    assert projection["generated_rows"][-1]["Total Debt"] > 0
    assert projection["summary"]["projected_payoff_date"] == "2026-10-01"
    assert projection["assumptions_snapshot"]["_projection_summary"]["projected_payoff_date"] == "2026-10-01"


def test_authoritative_payoff_metrics_apply_available_monthly_surplus_to_debt():
    income = [obj(id=1, label="Salary", amount=1000, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Card",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]
    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=3)

    metrics = calculate_payoff_metrics(debts, [], date(2026, 1, 1), projection["generated_rows"])

    assert metrics["payoffMonth"] == "2026-01-01"
    assert metrics["monthsToDebtFree"] == 1
    assert metrics["payoffStatus"] == "paid_off"
    assert projection["summary"]["projected_payoff_date"] == "2026-01-01"


def test_authoritative_payoff_metrics_returns_not_projected_for_negative_amortization():
    debts = [
        obj(
            id=1,
            name="High APR",
            debt_type="credit_card",
            starting_balance=10000,
            current_balance=10000,
            minimum_monthly_payment=10,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]
    rates = [obj(id=1, debt_id=1, apr_percentage=60, start_date=date(2026, 1, 1), end_date=None)]
    rows = [{"month": date(2026, 1, 1).isoformat(), "Remaining Cash": 0}]

    metrics = calculate_payoff_metrics(debts, rates, date(2026, 1, 1), rows)

    assert metrics["payoffMonth"] is None
    assert metrics["monthsToDebtFree"] is None
    assert metrics["payoffStatus"] == "not_projected"


def test_vehicle_loan_calculation():
    schedule = generate_vehicle_loan_schedule(1200, 12, 300, 0, date(2026, 1, 1))

    assert schedule["rows"][0]["monthly_interest"] == 12
    assert schedule["rows"][0]["principal_paid"] == 288
    assert schedule["payoff_month"] is not None
    assert schedule["total_interest_paid"] > 0


def test_saved_projection_shape_supports_retrieval():
    income, debts, rates = sample_inputs()
    projection = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=3)

    assert projection["assumptions_snapshot"]["income_sources"][0]["label"] == "Salary"
    assert projection["generated_rows"][0]["month"] == "2026-01-01"


def test_scenario_generation_preserves_baseline():
    income, debts, rates = sample_inputs()
    baseline = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=4)
    scenario_income = [obj(id=1, label="Salary", amount=6000, start_date=date(2026, 1, 1), end_date=None, active=True)]

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 2, 1),
        income_overrides=scenario_income,
    )

    feb = scenario["generated_rows"][1]
    assert feb["Income"] == 5500
    assert feb["Income+"] == 6500
    assert feb["Income Difference"] == 1000
    assert scenario["projection_type"] == "scenario"


def test_scenario_payoff_date_can_extend_beyond_visible_rows():
    income = [obj(id=1, label="Salary", amount=100, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Long Debt",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]
    baseline = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=3)

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 1, 1),
    )

    assert len(scenario["generated_rows"]) == 3
    assert scenario["generated_rows"][-1]["Total Debt+"] > 0
    assert scenario["summary"]["projected_payoff_date"] == baseline["summary"]["projected_payoff_date"]
    assert (
        scenario["assumptions_snapshot"]["_projection_summary"]["projected_payoff_date"]
        == baseline["summary"]["projected_payoff_date"]
    )


def test_scenario_generation_continues_baseline_balances_for_unchanged_debts():
    income, debts, rates = sample_inputs()
    baseline = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=4)

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 3, 1),
        income_overrides=[obj(id=1, label="Salary", amount=6000, start_date=date(2026, 1, 1), end_date=None, active=True)],
    )

    march = scenario["generated_rows"][2]
    assert march["Car+"] < baseline["generated_rows"][0]["Car"]
    assert march["Car+"] == march["Car"]


def test_scenario_generation_respects_optional_end_month():
    income, debts, rates = sample_inputs()
    baseline = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=5)

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 2, 1),
        income_overrides=[obj(id=1, label="Salary", amount=6000, start_date=date(2026, 1, 1), end_date=None, active=True)],
        scenario_end_month=date(2026, 3, 1),
    )

    assert "Income+" in scenario["generated_rows"][1]
    assert "Income+" in scenario["generated_rows"][2]
    assert "Income+" not in scenario["generated_rows"][3]


def test_scenario_generation_includes_new_debt_override_with_rate():
    income, debts, rates = sample_inputs()
    baseline = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=4)

    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 2, 1),
        debt_overrides=[
            obj(
                id=9001,
                name="Scenario Card",
                debt_type="credit_card",
                starting_balance=1200,
                current_balance=1200,
                minimum_monthly_payment=100,
                planned_extra_payment=25,
                start_date=date(2026, 2, 1),
                priority_number=1,
                active=True,
            )
        ],
        interest_rate_overrides=[
            obj(id=9101, debt_id=9001, apr_percentage=12, start_date=date(2026, 2, 1), end_date=None)
        ],
    )

    february = scenario["generated_rows"][1]
    assert february["Scenario Card+"] == 1087
    assert february["Scenario Card Interest+"] == 12
    assert february["Total Debt+"] > february["Total Debt"]


def test_dashboard_summary_uses_account_names_and_current_apr():
    income, debts, rates = sample_inputs()
    projection = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=4)
    saved = obj(
        id=1,
        projection_type="baseline",
        assumptions_snapshot=projection["assumptions_snapshot"],
        generated_rows=projection["generated_rows"],
    )

    from app.services.calculations import dashboard_summary

    dashboard = dashboard_summary(saved)
    names = {item["name"] for item in dashboard["datasets"]["debt_breakdown_by_account"]}
    assert names == {"Chase", "Car"}
    assert dashboard["summary"]["highest_apr_debt"] == "Car"


def test_dashboard_summary_uses_extended_payoff_metadata():
    income = [obj(id=1, label="Salary", amount=100, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Long Debt",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]
    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=3)
    saved = obj(
        id=1,
        projection_type="baseline",
        assumptions_snapshot=projection["assumptions_snapshot"],
        generated_rows=projection["generated_rows"],
    )

    from app.services.calculations import dashboard_summary

    dashboard = dashboard_summary(saved)

    assert dashboard["summary"]["payoff_estimate"] == "2026-10-01"
    assert dashboard["summary"]["months_to_debt_free"] == 10
    assert {"month": "2026-10-01", "label": "Long Debt Paid Off", "type": "paid-off"} in dashboard["datasets"]["milestones"]


def test_dashboard_milestones_include_payoffs_beyond_visible_projection_and_exclude_bills():
    income = [obj(id=1, label="Salary", amount=1000, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Long Vehicle",
            debt_type="vehicle_loan",
            starting_balance=1800,
            current_balance=1800,
            minimum_monthly_payment=200,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        ),
        obj(
            id=2,
            name="Child Expenses",
            debt_type="other",
            starting_balance=0,
            current_balance=0,
            minimum_monthly_payment=250,
            planned_extra_payment=0,
            recurrence="monthly",
            start_date=date(2026, 1, 1),
            priority_number=None,
            active=True,
        ),
    ]
    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=3)
    saved = obj(
        id=1,
        projection_type="baseline",
        assumptions_snapshot=projection["assumptions_snapshot"],
        generated_rows=projection["generated_rows"],
    )

    from app.services.calculations import dashboard_summary

    milestones = dashboard_summary(saved)["datasets"]["milestones"]

    assert {"month": "2026-09-01", "label": "Long Vehicle Paid Off", "type": "paid-off"} in milestones
    assert all("Child Expenses" not in item["label"] for item in milestones)


def test_dashboard_summary_ignores_stale_saved_payoff_metadata():
    income = [obj(id=1, label="Salary", amount=100, start_date=date(2026, 1, 1), end_date=None, active=True)]
    debts = [
        obj(
            id=1,
            name="Long Debt",
            debt_type="credit_card",
            starting_balance=1000,
            current_balance=1000,
            minimum_monthly_payment=100,
            planned_extra_payment=0,
            start_date=date(2026, 1, 1),
            priority_number=1,
            active=True,
        )
    ]
    projection = generate_baseline_projection(income, debts, [], date(2026, 1, 1), months=3)
    projection["assumptions_snapshot"]["_projection_summary"]["projected_payoff_date"] = "2026-03-01"
    saved = obj(
        id=1,
        projection_type="baseline",
        assumptions_snapshot=projection["assumptions_snapshot"],
        generated_rows=projection["generated_rows"],
    )

    from app.services.calculations import dashboard_summary

    dashboard = dashboard_summary(saved)

    assert dashboard["summary"]["payoff_estimate"] == "2026-10-01"
    assert dashboard["summary"]["months_to_debt_free"] == 10


def test_dashboard_summary_uses_scenario_columns_for_saved_scenarios():
    income, debts, rates = sample_inputs()
    baseline = generate_baseline_projection(income, debts, rates, date(2026, 1, 1), months=4)
    scenario = generate_scenario_projection(
        baseline["generated_rows"],
        baseline["assumptions_snapshot"],
        date(2026, 2, 1),
        income_overrides=[obj(id=1, label="Salary", amount=6000, start_date=date(2026, 1, 1), end_date=None, active=True)],
    )
    saved = obj(
        id=1,
        projection_type="scenario",
        assumptions_snapshot=scenario["assumptions_snapshot"],
        generated_rows=scenario["generated_rows"],
    )

    from app.services.calculations import dashboard_summary

    dashboard = dashboard_summary(saved)

    assert dashboard["summary"]["income_total"] == scenario["generated_rows"][1]["Income+"]
    assert dashboard["datasets"]["total_debt_over_time"][1]["value"] == scenario["generated_rows"][1]["Total Debt+"]
