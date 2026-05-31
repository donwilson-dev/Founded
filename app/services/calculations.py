from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

MAX_PROJECTION_MONTHS = 25 * 12

def parse_date(value: date | str) -> date:
    if isinstance(value, str):
        return date.fromisoformat(value)
    return value


def first_of_month(value: date | str) -> date:
    value = parse_date(value)
    return value.replace(day=1)


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def last_of_month(value: date | str) -> date:
    return add_months(first_of_month(value), 1) - timedelta(days=1)


def inclusive_month_count(start: date | str, end: date | str) -> int:
    start = first_of_month(start)
    end = first_of_month(end)
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def month_range(start_month: date, months: int | None = None, end_month: date | None = None) -> list[date]:
    start = first_of_month(start_month)
    if end_month:
        end = first_of_month(end_month)
        max_end = add_months(start, MAX_PROJECTION_MONTHS - 1)
        if end > max_end:
            end = max_end
        result = []
        current = start
        while current <= end:
            result.append(current)
            current = add_months(current, 1)
        return result
    return [add_months(start, index) for index in range(min(months or 60, MAX_PROJECTION_MONTHS))]


def as_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    data = {}
    for key in obj.__dict__:
        if key.startswith("_") or key in {"interest_rates", "debt"}:
            continue
        value = getattr(obj, key)
        if hasattr(value, "value"):
            value = value.value
        data[key] = value
    return data


def json_ready(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return json_ready(value.model_dump(mode="json"))
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    if hasattr(value, "value"):
        return value.value
    return value


def is_active_for_month(item: dict[str, Any], month: date) -> bool:
    return occurrence_count_for_month(
        item.get("frequency", "monthly"),
        item["start_date"],
        item.get("end_date") or item.get("payoff_target_date"),
        month,
        active=item.get("active", True),
    ) > 0


def normalized_frequency(value: Any, default: str = "monthly") -> str:
    if value is None or value == "":
        return default
    if hasattr(value, "value"):
        return value.value
    return str(value)


def occurrence_count_for_month(
    frequency: Any,
    start_date: date | str,
    end_date: date | str | None,
    month: date,
    *,
    active: bool = True,
) -> int:
    if not active:
        return 0
    frequency = normalized_frequency(frequency)
    start = parse_date(start_date)
    end = parse_date(end_date) if end_date else None
    month_start = first_of_month(month)
    month_end = last_of_month(month_start)
    range_start = max(start, month_start)
    range_end = min(end or month_end, month_end)
    if range_start > range_end:
        return 0

    if frequency == "one_time":
        return 1 if month_start <= start <= month_end and (end is None or start <= end) else 0
    if frequency == "monthly":
        return 1
    if frequency in {"weekly", "bi_weekly"}:
        interval_days = 7 if frequency == "weekly" else 14
        days_after_anchor = max((range_start - start).days, 0)
        occurrence_offset = ((days_after_anchor + interval_days - 1) // interval_days) * interval_days
        first_occurrence = start + timedelta(days=occurrence_offset)
        if first_occurrence > range_end:
            return 0
        return ((range_end - first_occurrence).days // interval_days) + 1
    if frequency == "first_and_fifteenth":
        candidates = [month_start, date(month_start.year, month_start.month, 15)]
        return sum(1 for candidate in candidates if range_start <= candidate <= range_end)
    return 1


def applicable_apr(debt_id: int, rates: Iterable[Any], month: date) -> float:
    candidates = []
    for raw_rate in rates:
        rate = as_dict(raw_rate)
        if rate.get("debt_id") != debt_id:
            continue
        start = first_of_month(rate["start_date"])
        end = rate.get("end_date")
        if start <= month and (end is None or month <= first_of_month(end)):
            candidates.append(rate)
    if not candidates:
        return 0.0
    # Promo rates usually have an end date. Prefer them over indefinite regular
    # rates when both apply to the same month.
    candidates.sort(key=lambda item: (first_of_month(item["start_date"]), item.get("end_date") is not None), reverse=True)
    return float(candidates[0]["apr_percentage"])


def debt_apr(debt: dict[str, Any], rates: Iterable[Any], month: date) -> float:
    if debt.get("debt_type") == "other":
        return 0.0
    return applicable_apr(debt["id"], rates, month)


def is_bill(debt: dict[str, Any]) -> bool:
    return debt.get("debt_type") == "other"


def is_true_debt(debt: dict[str, Any]) -> bool:
    return not is_bill(debt)


def monthly_income_amount(source: dict[str, Any], month: date) -> float:
    return float(source["amount"]) * occurrence_count_for_month(
        source.get("frequency", "monthly"),
        source["start_date"],
        source.get("end_date"),
        month,
        active=source.get("active", True),
    )


def base_actual_payment(debt: dict[str, Any]) -> float:
    minimum = float(debt["minimum_monthly_payment"])
    actual = debt.get("actual_monthly_payment")
    if actual is not None:
        return max(float(actual), minimum)
    return minimum + float(debt.get("planned_extra_payment") or 0)


def debt_type_label(value: Any) -> str:
    value = normalized_frequency(value, default="")
    return value.replace("_", " ").title() if value else "Debt"


def payment_label(amount: float) -> str:
    amount = float(amount or 0)
    return f"${amount:,.0f}/mo" if amount.is_integer() else f"${amount:,.2f}/mo"


def debt_column_labels(debts: list[dict[str, Any]]) -> dict[Any, str]:
    name_groups: dict[str, list[dict[str, Any]]] = {}
    for debt in debts:
        name_groups.setdefault(str(debt.get("name") or "Debt").strip().lower(), []).append(debt)

    labels: dict[Any, str] = {}
    used: set[str] = set()
    for index, debt in enumerate(debts):
        identity = debt.get("id", index)
        name = str(debt.get("name") or "Debt").strip() or "Debt"
        duplicate_group = name_groups.get(name.lower(), [])
        if len(duplicate_group) == 1:
            label = name
        else:
            debt_type = debt_type_label(debt.get("debt_type"))
            same_type_count = sum(1 for item in duplicate_group if item.get("debt_type") == debt.get("debt_type"))
            label = f"{name} ({debt_type})"
            if same_type_count > 1:
                label = f"{name} ({debt_type} - {payment_label(base_actual_payment(debt))})"
        if label in used:
            label = f"{label} #{identity}"
        labels[identity] = label
        used.add(label)
    return labels


def scheduled_actual_payment(debt: dict[str, Any], month: date | None = None) -> float:
    payment = base_actual_payment(debt)
    if debt.get("debt_type") == "other":
        if month is None:
            return payment
        return payment * occurrence_count_for_month(
            debt.get("recurrence") or "monthly",
            debt["start_date"],
            debt.get("payoff_target_date"),
            month,
            active=debt.get("active", True),
        )
    return payment


def debt_payment_active_for_month(debt: dict[str, Any], month: date) -> bool:
    if not debt.get("active", True):
        return False
    start = parse_date(debt["start_date"])
    if month < first_of_month(start):
        return False
    if debt.get("debt_type") != "other":
        return True
    return occurrence_count_for_month(
        debt.get("recurrence") or "monthly",
        debt["start_date"],
        debt.get("payoff_target_date"),
        month,
        active=debt.get("active", True),
    ) > 0


def monthly_interest(balance: float, apr_percentage: float) -> float:
    return round(balance * (apr_percentage / 100 / 12), 2)


def _remaining_cash_by_month(projection_rows: list[dict[str, Any]] | None) -> dict[str, float]:
    if not projection_rows:
        return {}
    return {
        row["month"]: float(row.get("Monthly Surplus", row.get("Remaining Cash", 0)) or 0)
        for row in projection_rows
        if row.get("month")
    }


def _ordered_active_debts(debts: Iterable[Any]) -> list[dict[str, Any]]:
    debt_data = [as_dict(item) for item in debts if as_dict(item).get("active", True) and is_true_debt(as_dict(item))]
    return sorted(
        debt_data,
        key=lambda debt: (
            debt.get("priority_number") is None,
            debt.get("priority_number") or float("inf"),
            float(debt.get("current_balance") or 0),
        ),
    )


def calculate_payoff_metrics(
    debts: Iterable[Any],
    interest_rates: Iterable[Any],
    start_month: date,
    projection_rows: list[dict[str, Any]] | None = None,
    max_months: int = MAX_PROJECTION_MONTHS,
) -> dict[str, Any]:
    """Authoritative debt payoff simulation for summary-level payoff metrics.

    Projection tables show scheduled payments. Summary payoff timing also applies
    available monthly surplus and paid-off payment rollover directly to debt
    balances, then declares payoff only when simulated total debt reaches zero.
    """
    ordered = _ordered_active_debts(debts)
    if not ordered:
        return {
            "payoffMonth": None,
            "monthsToDebtFree": None,
            "totalProjectedInterest": 0.0,
            "payoffStatus": "no_active_debt",
        }

    rate_data = [as_dict(item) for item in interest_rates]
    balances = {debt["id"]: float(debt.get("current_balance") or 0) for debt in ordered}
    if sum(max(balance, 0) for balance in balances.values()) <= 0:
        month = first_of_month(start_month).isoformat()
        return {
            "payoffMonth": month,
            "monthsToDebtFree": 1,
            "totalProjectedInterest": 0.0,
            "payoffStatus": "paid_off",
        }

    cash_by_month = _remaining_cash_by_month(projection_rows)
    last_available_cash = 0.0
    total_interest = 0.0
    rollover = 0.0
    max_count = min(int(max_months or MAX_PROJECTION_MONTHS), MAX_PROJECTION_MONTHS)

    for month in month_range(start_month, max_count):
        month_key = month.isoformat()
        if month_key in cash_by_month:
            last_available_cash = max(cash_by_month[month_key], 0.0)
        available_extra = max(last_available_cash, 0.0)
        active_debts = [debt for debt in ordered if balances[debt["id"]] > 0 and debt_payment_active_for_month(debt, month)]
        if not active_debts:
            if sum(max(balance, 0) for balance in balances.values()) > 0:
                continue
            payoff_month = month_key
            return {
                "payoffMonth": payoff_month,
                "monthsToDebtFree": inclusive_month_count(start_month, payoff_month),
                "totalProjectedInterest": round(total_interest, 2),
                "payoffStatus": "paid_off",
            }

        target_id = active_debts[0]["id"]
        paid_off_this_month: list[dict[str, Any]] = []
        for debt in ordered:
            debt_id = debt["id"]
            if balances[debt_id] <= 0:
                continue
            if not debt_payment_active_for_month(debt, month):
                continue

            apr = debt_apr(debt, rate_data, month)
            interest = monthly_interest(balances[debt_id], apr)
            total_interest += interest
            payment_budget = scheduled_actual_payment(debt, month)
            if debt_id == target_id:
                payment_budget += rollover + available_extra
            payment = min(balances[debt_id] + interest, payment_budget)
            ending_balance = max(balances[debt_id] + interest - payment, 0)
            if ending_balance == 0:
                paid_off_this_month.append(debt)
            balances[debt_id] = ending_balance

        for debt in paid_off_this_month:
            rollover += scheduled_actual_payment(debt, month)

        if sum(max(balance, 0) for balance in balances.values()) == 0:
            payoff_month = month_key
            return {
                "payoffMonth": payoff_month,
                "monthsToDebtFree": inclusive_month_count(start_month, payoff_month),
                "totalProjectedInterest": round(total_interest, 2),
                "payoffStatus": "paid_off",
            }

    return {
        "payoffMonth": None,
        "monthsToDebtFree": None,
        "totalProjectedInterest": round(total_interest, 2),
        "payoffStatus": "not_projected",
    }


def _identity_key(item: dict[str, Any], natural_key: str | None = None) -> Any:
    if item.get("id") is not None:
        return ("id", item["id"])
    if natural_key and item.get(natural_key) is not None:
        return (natural_key, item[natural_key])
    if "debt_id" in item and "start_date" in item:
        return ("debt_rate", item["debt_id"], first_of_month(item["start_date"]))
    return None


def merge_assumption_collection(
    baseline_items: Iterable[Any], override_items: Iterable[Any] | None, natural_key: str | None = None
) -> tuple[list[dict[str, Any]], set[Any]]:
    """Merge scenario inputs over saved baseline assumptions without dropping unchanged accounts."""
    baseline = [as_dict(item) for item in baseline_items]
    overrides = [as_dict(item) for item in (override_items or [])]
    merged_by_key = {}
    ordered_keys = []

    for item in baseline:
        key = _identity_key(item, natural_key)
        if key is None:
            key = ("position", len(ordered_keys))
        merged_by_key[key] = item
        ordered_keys.append(key)

    override_keys = set()
    for item in overrides:
        key = _identity_key(item, natural_key)
        if item.get("id") is None and natural_key and item.get(natural_key) is not None:
            key = next(
                (
                    existing_key
                    for existing_key in ordered_keys
                    if merged_by_key[existing_key].get(natural_key) == item[natural_key]
                ),
                key,
            )
        if key is None:
            key = ("override", len(ordered_keys))
        if key not in merged_by_key:
            ordered_keys.append(key)
        merged_by_key[key] = item
        override_keys.add(key)

    return [merged_by_key[key] for key in ordered_keys], override_keys


def snapshot_assumptions(
    income_sources: Iterable[Any],
    debts: Iterable[Any],
    interest_rates: Iterable[Any],
    account_balances: Iterable[Any] | None = None,
) -> dict[str, Any]:
    return json_ready(
        {
            "income_sources": [as_dict(item) for item in income_sources],
            "debts": [as_dict(item) for item in debts],
            "interest_rates": [as_dict(item) for item in interest_rates],
            "account_balances": [as_dict(item) for item in (account_balances or [])],
        }
    )


def starting_cash_balance(account_balances: Iterable[Any] | None, start_month: date) -> float:
    start = first_of_month(start_month)
    total = 0.0
    for raw_balance in account_balances or []:
        balance = as_dict(raw_balance)
        if not balance.get("active", True):
            continue
        if first_of_month(balance["date"]) <= start:
            total += float(balance["amount"])
    return round(total, 2)


def generate_baseline_projection(
    income_sources: Iterable[Any],
    debts: Iterable[Any],
    interest_rates: Iterable[Any],
    start_month: date,
    months: int | None = 60,
    end_month: date | None = None,
    account_balances: Iterable[Any] | None = None,
    include_extended_payoff: bool = True,
) -> dict[str, Any]:
    """Generate month-end debt balances after monthly interest and scheduled payments."""
    income_data = [as_dict(item) for item in income_sources]
    debt_data = [as_dict(item) for item in debts if as_dict(item).get("active", True)]
    rate_data = [as_dict(item) for item in interest_rates]
    column_labels = debt_column_labels(debt_data)
    for index, debt in enumerate(debt_data):
        debt["_projection_label"] = column_labels.get(debt.get("id", index), debt.get("name", "Debt"))
    balances = {debt["id"]: float(debt["current_balance"]) for debt in debt_data}
    starting_cash = starting_cash_balance(account_balances, start_month)
    cash_balance = starting_cash
    rows = []

    for month in month_range(start_month, months, end_month):
        row: dict[str, Any] = {"month": month.isoformat()}
        income_total = sum(monthly_income_amount(source, month) for source in income_data)
        row["Income"] = round(income_total, 2)

        paid_off = []
        total_balance = 0.0
        total_minimum = 0.0
        total_extra = 0.0
        total_interest = 0.0
        total_debt_payments = 0.0
        total_bills = 0.0

        for debt in debt_data:
            debt_id = debt["id"]
            name = debt.get("_projection_label") or debt["name"]
            bill = is_bill(debt)
            if month < first_of_month(debt["start_date"]) or (balances[debt_id] <= 0 and not bill):
                row[name] = round(max(balances[debt_id], 0), 2)
                row[f"{name} Payment"] = 0.0
                row[f"{name} Interest"] = 0.0
                row[f"{name} Principal"] = 0.0
                continue
            if not debt_payment_active_for_month(debt, month):
                row[name] = round(max(balances[debt_id], 0), 2)
                row[f"{name} Payment"] = 0.0
                row[f"{name} Interest"] = 0.0
                row[f"{name} Principal"] = 0.0
                if not bill:
                    total_balance += balances[debt_id]
                continue

            apr = debt_apr(debt, rate_data, month)
            interest = monthly_interest(balances[debt_id], apr)
            scheduled_minimum = float(debt["minimum_monthly_payment"])
            scheduled_actual = scheduled_actual_payment(debt, month)
            scheduled_extra = max(scheduled_actual - scheduled_minimum, 0)
            payment = scheduled_actual if bill else min(balances[debt_id] + interest, scheduled_actual)
            principal_paid = max(payment - interest, 0)
            ending_balance = 0.0 if bill else max(balances[debt_id] + interest - payment, 0)

            row[name] = round(ending_balance, 2)
            row[f"{name} Payment"] = 0.0 if bill else round(payment, 2)
            if bill:
                row[f"{name} Bill"] = round(payment, 2)
            row[f"{name} Interest"] = round(interest, 2)
            row[f"{name} Principal"] = 0.0 if bill else round(principal_paid, 2)

            if not bill and balances[debt_id] > 0 and ending_balance == 0:
                paid_off.append(name)

            balances[debt_id] = ending_balance
            if bill:
                total_bills += payment
            else:
                total_balance += ending_balance
                total_interest += interest
                total_debt_payments += payment
            if payment and not bill:
                total_minimum += min(scheduled_minimum, payment)
                total_extra += max(payment - scheduled_minimum, 0)

        row["Total Debt"] = round(total_balance, 2)
        row["Total Minimum Payments"] = round(total_minimum, 2)
        row["Total Extra Payments"] = round(total_extra, 2)
        row["Total Debt Payments"] = round(total_debt_payments, 2)
        row["Bills"] = round(total_bills, 2)
        row["Total Interest Charged"] = round(total_interest, 2)
        row["Monthly Surplus"] = round(income_total - total_debt_payments - total_bills, 2)
        cash_balance += row["Monthly Surplus"]
        row["Cash Balance"] = round(cash_balance, 2)
        row["Debts Paid Off"] = paid_off
        rows.append(row)

    payoff_rows = rows
    if include_extended_payoff and debt_data:
        extended = generate_baseline_projection(
            income_data,
            debt_data,
            rate_data,
            start_month,
            months=MAX_PROJECTION_MONTHS,
            account_balances=account_balances,
            include_extended_payoff=False,
        )
        payoff_rows = extended["generated_rows"]
    payoff_metrics = calculate_payoff_metrics(debt_data, rate_data, start_month, payoff_rows)
    projected_payoff_date = payoff_metrics["payoffMonth"]

    assumptions_snapshot = snapshot_assumptions(income_data, debt_data, rate_data, account_balances)
    assumptions_snapshot["_projection_summary"] = {
        "projected_payoff_date": projected_payoff_date,
        "months_to_debt_free": payoff_metrics["monthsToDebtFree"],
        "total_projected_interest": payoff_metrics["totalProjectedInterest"],
        "payoff_status": payoff_metrics["payoffStatus"],
    }

    return {
        "projection_type": "baseline",
        "assumptions_snapshot": assumptions_snapshot,
        "generated_rows": rows,
        "summary": {
            "projected_payoff_date": projected_payoff_date,
            "months_to_debt_free": payoff_metrics["monthsToDebtFree"],
            "total_projected_interest": payoff_metrics["totalProjectedInterest"],
            "payoff_status": payoff_metrics["payoffStatus"],
        },
    }


def generate_vehicle_loan_schedule(
    starting_balance: float,
    apr_percentage: float,
    monthly_payment: float,
    extra_payment: float = 0,
    start_month: date | None = None,
    max_months: int = MAX_PROJECTION_MONTHS,
) -> dict[str, Any]:
    month = first_of_month(start_month or date.today())
    balance = float(starting_balance)
    rows = []
    total_interest = 0.0
    payoff_month = None

    for _ in range(min(max_months, MAX_PROJECTION_MONTHS)):
        if balance <= 0:
            break
        interest = monthly_interest(balance, apr_percentage)
        payment = min(balance + interest, monthly_payment + extra_payment)
        principal = max(payment - interest, 0)
        balance = max(balance + interest - payment, 0)
        total_interest += interest
        rows.append(
            {
                "month": month.isoformat(),
                "starting_balance": round(balance + principal, 2),
                "apr_percentage": apr_percentage,
                "monthly_payment": round(payment, 2),
                "extra_payment": round(max(payment - monthly_payment, 0), 2),
                "monthly_interest": round(interest, 2),
                "principal_paid": round(principal, 2),
                "ending_balance": round(balance, 2),
            }
        )
        if balance == 0:
            payoff_month = month.isoformat()
        month = add_months(month, 1)

    return {"rows": rows, "payoff_month": payoff_month, "total_interest_paid": round(total_interest, 2)}


def generate_scenario_projection(
    baseline_rows: list[dict[str, Any]],
    baseline_assumptions: dict[str, Any],
    scenario_start_month: date,
    income_overrides: list[Any] | None = None,
    debt_overrides: list[Any] | None = None,
    interest_rate_overrides: list[Any] | None = None,
    months: int | None = None,
    scenario_end_month: date | None = None,
) -> dict[str, Any]:
    income, _ = merge_assumption_collection(
        baseline_assumptions.get("income_sources", []), income_overrides, natural_key="label"
    )
    debts, overridden_debt_keys = merge_assumption_collection(
        baseline_assumptions.get("debts", []), debt_overrides, natural_key="name"
    )
    rates, _ = merge_assumption_collection(baseline_assumptions.get("interest_rates", []), interest_rate_overrides)
    next_temporary_debt_id = -1
    for debt in debts:
        if debt.get("id") is None:
            debt["id"] = next_temporary_debt_id
            next_temporary_debt_id -= 1
    start = first_of_month(scenario_start_month)
    end = first_of_month(scenario_end_month) if scenario_end_month else None
    if end:
        requested_months = len([row for row in baseline_rows if start <= date.fromisoformat(row["month"]) <= end])
    else:
        requested_months = months or len([row for row in baseline_rows if date.fromisoformat(row["month"]) >= start])
    requested_months = min(requested_months, MAX_PROJECTION_MONTHS)

    prior_month = add_months(start, -1)
    balance_source_row = next((row for row in baseline_rows if date.fromisoformat(row["month"]) == prior_month), None)
    if balance_source_row:
        for debt in debts:
            key = _identity_key(debt, "name")
            balance_key = debt.get("_projection_label") or debt.get("name")
            if key not in overridden_debt_keys and balance_key in balance_source_row:
                debt["current_balance"] = balance_source_row[balance_key]

    scenario = generate_baseline_projection(
        income,
        debts,
        rates,
        start,
        requested_months,
        account_balances=baseline_assumptions.get("account_balances", []),
    )
    scenario_by_month = {row["month"]: row for row in scenario["generated_rows"]}

    rows = []
    for baseline_row in baseline_rows:
        month = date.fromisoformat(baseline_row["month"])
        merged = dict(baseline_row)
        if month >= start and (end is None or month <= end) and baseline_row["month"] in scenario_by_month:
            scenario_row = scenario_by_month[baseline_row["month"]]
            for key, value in scenario_row.items():
                if key in {"month", "Debts Paid Off"}:
                    continue
                merged[f"{key}+"] = value
                if isinstance(value, (int, float)) and isinstance(baseline_row.get(key), (int, float)):
                    merged[f"{key} Difference"] = round(value - baseline_row[key], 2)
            merged["Debts Paid Off+"] = scenario_row.get("Debts Paid Off", [])
        rows.append(merged)

    return {
        "projection_type": "scenario",
        "assumptions_snapshot": json_ready(
            {
                "_projection_summary": {
                    "projected_payoff_date": scenario.get("summary", {}).get("projected_payoff_date"),
                    "months_to_debt_free": scenario.get("summary", {}).get("months_to_debt_free"),
                    "total_projected_interest": scenario.get("summary", {}).get("total_projected_interest"),
                    "payoff_status": scenario.get("summary", {}).get("payoff_status"),
                },
                "baseline_assumptions": baseline_assumptions,
                "scenario_start_month": start,
                "scenario_end_month": end,
                "income_sources": income,
                "debts": debts,
                "interest_rates": rates,
                "account_balances": baseline_assumptions.get("account_balances", []),
            }
        ),
        "generated_rows": rows,
        "summary": scenario.get("summary", {}),
    }


def milestone_dataset(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    milestones = []
    debt_free_added = False
    for row in rows or []:
        month = row.get("month")
        if not month:
            continue
        for name in row.get("Debts Paid Off") or []:
            milestones.append({"month": month, "label": f"{name} Paid Off", "type": "paid-off"})
        if not debt_free_added and float(row.get("Total Debt", 0) or 0) <= 0:
            debt_free_added = True
            milestones.append({"month": month, "label": "Debt Free", "type": "debt-free"})
    return milestones


def dashboard_summary(saved_projection: Any) -> dict[str, Any]:
    """Build frontend-ready summary metrics from saved rows without recalculating the projection."""
    rows = saved_projection.generated_rows
    if not rows:
        return {"summary": {}, "datasets": {}}
    first = rows[0]
    last = rows[-1]
    scenario_keys = any(key.endswith("+") for row in rows for key in row)
    use_scenario_values = str(saved_projection.projection_type) == "scenario" and scenario_keys
    suffix = "+" if use_scenario_values else ""
    summary_rows = [row for row in rows if f"Total Debt{suffix}" in row] if use_scenario_values else rows
    if not summary_rows:
        summary_rows = rows
    summary_first = summary_rows[0] if summary_rows else first
    summary_last = summary_rows[-1] if summary_rows else last
    assumptions = saved_projection.assumptions_snapshot
    rates = assumptions.get("interest_rates") or assumptions.get("baseline_assumptions", {}).get("interest_rates", [])
    debts = assumptions.get("debts") or assumptions.get("baseline_assumptions", {}).get("debts", [])
    income_sources = assumptions.get("income_sources") or assumptions.get("baseline_assumptions", {}).get("income_sources", [])
    account_balances = assumptions.get("account_balances") or assumptions.get("baseline_assumptions", {}).get("account_balances", [])
    debt_names = [
        debt.get("_projection_label") or debt["name"]
        for debt in debts
        if is_true_debt(debt) and (debt.get("_projection_label") or debt.get("name")) in first
    ]
    total_interest = round(sum(float(row.get(f"Total Interest Charged{suffix}", row.get("Total Interest Charged", 0))) for row in summary_rows), 2)
    surplus_key = f"Monthly Surplus{suffix}"
    fallback_surplus_key = f"Remaining Cash{suffix}"
    lowest_cash_row = min(summary_rows, key=lambda row: float(row.get(surplus_key, row.get(fallback_surplus_key, row.get("Monthly Surplus", row.get("Remaining Cash", 0))))))
    lowest_cash = float(lowest_cash_row.get(surplus_key, lowest_cash_row.get(fallback_surplus_key, lowest_cash_row.get("Monthly Surplus", lowest_cash_row.get("Remaining Cash", 0)))))
    average_surplus = round(
        sum(float(row.get(surplus_key, row.get(fallback_surplus_key, row.get("Monthly Surplus", row.get("Remaining Cash", 0))))) for row in summary_rows) / len(summary_rows),
        2,
    )
    start_month = date.fromisoformat(summary_first["month"])
    payoff_rows = [
        {
            "month": row["month"],
            "Monthly Surplus": row.get(surplus_key, row.get(fallback_surplus_key, row.get("Monthly Surplus", row.get("Remaining Cash", 0)))),
        }
        for row in summary_rows
    ]
    true_debts = [debt for debt in debts if is_true_debt(debt)]
    true_debt_ids = {debt.get("id") for debt in true_debts}
    true_rates = [rate for rate in rates if rate.get("debt_id") in true_debt_ids]
    if true_debts:
        extended = generate_baseline_projection(
            income_sources,
            true_debts,
            true_rates,
            start_month,
            months=MAX_PROJECTION_MONTHS,
            account_balances=account_balances,
            include_extended_payoff=False,
        )
        payoff_rows = extended["generated_rows"]
    payoff_metrics = calculate_payoff_metrics(true_debts, true_rates, start_month, payoff_rows)
    projected_payoff_date = payoff_metrics["payoffMonth"]
    months_to_debt_free = payoff_metrics["monthsToDebtFree"]
    total_interest = payoff_metrics["totalProjectedInterest"] if true_debts else total_interest
    highest_balance_debt = max(debt_names, key=lambda name: first.get(name, 0), default=None)
    highest_apr_debt = None
    if true_debts and true_rates:
        first_month = date.fromisoformat(first["month"])
        highest = max(true_debts, key=lambda debt: debt_apr(debt, true_rates, first_month))
        highest_apr_debt = highest["name"]

    datasets = {
        "total_debt_over_time": [{"month": row["month"], "value": row.get(f"Total Debt{suffix}", row.get("Total Debt", 0))} for row in rows],
        "remaining_cash_flow_over_time": [
            {"month": row["month"], "value": row.get(surplus_key, row.get(fallback_surplus_key, row.get("Monthly Surplus", row.get("Remaining Cash", 0))))} for row in rows
        ],
        "cash_balance_over_time": [{"month": row["month"], "value": row.get(f"Cash Balance{suffix}", row.get("Cash Balance", 0))} for row in rows],
        "bills_over_time": [{"month": row["month"], "value": row.get(f"Bills{suffix}", row.get("Bills", 0))} for row in rows],
        "interest_charged_over_time": [
            {"month": row["month"], "value": row.get(f"Total Interest Charged{suffix}", row.get("Total Interest Charged", 0))} for row in rows
        ],
        "principal_paid_over_time": [
            {
                "month": row["month"],
                "value": round(
                    float(row.get(f"Total Debt Payments{suffix}", row.get("Total Debt Payments", 0)))
                    - float(row.get(f"Total Interest Charged{suffix}", row.get("Total Interest Charged", 0))),
                    2,
                ),
            }
            for row in rows
        ],
        "debt_breakdown_by_account": [{"name": name, "value": first.get(name, 0)} for name in debt_names],
        "milestones": milestone_dataset(payoff_rows),
    }
    if scenario_keys:
        datasets["scenario_total_debt_over_time"] = [
            {"month": row["month"], "value": row.get("Total Debt+", row.get("Total Debt", 0))} for row in rows
        ]
        datasets["scenario_remaining_cash_flow_over_time"] = [
            {"month": row["month"], "value": row.get("Monthly Surplus+", row.get("Remaining Cash+", row.get("Monthly Surplus", row.get("Remaining Cash", 0))))} for row in rows
        ]
    return {
        "projection_id": saved_projection.id,
        "projection_type": saved_projection.projection_type,
        "supports_scenario": scenario_keys,
        "projection_rows": rows,
        "summary": {
            "total_debt": summary_first.get(f"Total Debt{suffix}", summary_first.get("Total Debt", 0)),
            "income_total": summary_first.get(f"Income{suffix}", summary_first.get("Income", 0)),
            "total_debt_payments": summary_first.get(f"Total Debt Payments{suffix}", summary_first.get("Total Debt Payments", 0)),
            "bills": summary_first.get(f"Bills{suffix}", summary_first.get("Bills", 0)),
            "remaining_cash": summary_first.get(surplus_key, summary_first.get(fallback_surplus_key, summary_first.get("Monthly Surplus", summary_first.get("Remaining Cash", 0)))),
            "cash_balance": summary_first.get(f"Cash Balance{suffix}", summary_first.get("Cash Balance", summary_first.get("Monthly Surplus", summary_first.get("Remaining Cash", 0)))),
            "payoff_estimate": projected_payoff_date,
            "months_to_debt_free": months_to_debt_free,
            "payoff_status": payoff_metrics["payoffStatus"],
            "highest_balance_debt": highest_balance_debt,
            "highest_apr_debt": highest_apr_debt,
            "next_projected_payoff": next((row["Debts Paid Off"][0] for row in rows if row.get("Debts Paid Off")), None),
            "total_interest_projected": total_interest,
            "lowest_projected_remaining_cash_month": lowest_cash_row["month"],
            "lowest_projected_remaining_cash": round(lowest_cash, 2),
            "average_monthly_surplus": average_surplus,
            "ending_total_debt": summary_last.get(f"Total Debt{suffix}", summary_last.get("Total Debt", 0)),
        },
        "datasets": datasets,
    }
