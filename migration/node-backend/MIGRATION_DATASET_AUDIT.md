# Migration Dataset Audit

Status date: June 4, 2026

Dataset Version: 1.0

Current source of truth: FastAPI + SQLite.

MongoDB status: non-authoritative migration target.

Import status: Deferred.

## Canonical Dataset Definition

Dataset Version 1.0 is the official Founded migration dataset. It is defined by the approved synthetic demo dataset and migration reference values, not by current SQLite contents.

Canonical dataset anchors:

- Demo Household Baseline
- Demo Debt Reduction Scenario
- Demo Income Increase Scenario
- Demo Emergency Expense Scenario

Saved projection anchors:

- Baseline Projection: `Demo Household Baseline`
- Debt Reduction Projection: `Demo Debt Reduction Scenario`
- Income Increase Projection: `Demo Income Increase Scenario`
- Emergency Expense Projection: `Demo Emergency Expense Scenario`

If SQLite contents drift, Dataset Version 1.0 remains unchanged until a future dataset audit explicitly increments the dataset version.

## Dataset Inventory

| Entity | Expected Count | Source Dataset | Target Collection | Relationship Requirements |
| --- | ---: | --- | --- | --- |
| Accounts | 4 | Approved demo seed records | `accountBalances` | Owners must be preserved as `Alex`, `Jordan`, and `Joint`. |
| Income Sources | 5 | Approved demo seed records | `incomeSources` | Four income records reference accounts; one transfer references distinct from/to accounts. |
| Debts | 8 | Approved demo seed records | `debts` | Every debt references an account; APR-bearing debts must remain distinguishable from `other` obligations. |
| Interest Rates | 5 | Approved demo seed records | `interestRates` | Every interest-rate row references its source debt. |
| Scenarios | 3 | Approved demo scenario anchors | `savedProjections` | Every scenario references the baseline saved projection in future imported assumptions. |
| Saved Projections | 4 | Approved demo projection anchors | `savedProjections` | One baseline and three scenario projection anchors must be preserved. |

## Expected Record Counts

| Collection | Expected Documents | Notes |
| --- | ---: | --- |
| `accountBalances` | 4 | Source account records. |
| `incomeSources` | 5 | Includes one account-transfer record. |
| `debts` | 8 | Includes four payoff debts and four `other` obligations. |
| `interestRates` | 5 | APR schedule rows for payoff debts only. |
| `savedProjections` | 4 | Projection/scenario anchors; full document import deferred. |
| Scenario documents in `savedProjections` | 3 | `projection_type=scenario`. |

## Collection Mappings

| Source Entity | Target Collection | Expected Count | References | Known Migration Risks |
| --- | --- | ---: | --- | --- |
| `AccountBalance` | `accountBalances` | 4 | Referenced by income sources, transfers, and debts. | MongoDB ObjectIds must not break future API id expectations. |
| `IncomeSource` | `incomeSources` | 5 | References account, from account, and to account. | Account transfer records must not become income during later calculation migration. |
| `Debt` | `debts` | 8 | References account; referenced by interest rates. | `other` debts must remain general obligations, not APR payoff debts. |
| `InterestRate` | `interestRates` | 5 | References debt. | Separate collection is retained for API parity until embedding is explicitly approved. |
| Scenario saved projections | `savedProjections` | 3 | Reference the baseline projection through assumptions in future migrated documents. | Full scenario documents require future projection/scenario migration approval. |
| Saved projections | `savedProjections` | 4 | Store assumptions and generated rows in future imported documents. | Generated rows are validation-sensitive and are not imported in Phase 5. |

## Relationship Mappings

### Account Ownership References

Required owners:

- `Primary Checking`: `Alex`
- `Emergency Savings`: `Alex`
- `Vacation Savings`: `Jordan`
- `Joint Checking`: `Joint`

Verification rule:

- Every account document must preserve its owner value exactly.
- Owner values are not hardcoded application users; they are dataset ownership labels.

### Income Source Account References

Required direct account references:

- `Primary Salary` -> `Primary Checking`
- `Partner Salary` -> `Joint Checking`
- `Side Consulting` -> `Primary Checking`
- `Annual Bonus` -> `Emergency Savings`

Required transfer references:

- `Vacation Savings Transfer` -> from `Primary Checking`, to `Vacation Savings`

Verification rule:

- Non-transfer income sources must have one account reference.
- Transfer income sources must have both from and to account references.
- Transfer from and to accounts must be different.

### Debt Account References

Required account references:

- `Travel Rewards Card` -> `Primary Checking`
- `Family Auto Loan` -> `Joint Checking`
- `Home Improvement Loan` -> `Primary Checking`
- `Graduate Student Loan` -> `Joint Checking`
- `Utilities` -> `Joint Checking`
- `Streaming Services` -> `Primary Checking`
- `Auto Insurance` -> `Primary Checking`
- `Warehouse Membership` -> `Primary Checking`

Verification rule:

- Every debt document must reference one account.
- `other` debts must remain `debt_type=other`.

### Debt To Interest Rate Relationships

Required relationships:

- `Travel Rewards Card` -> 2 interest-rate rows
- `Family Auto Loan` -> 1 interest-rate row
- `Home Improvement Loan` -> 1 interest-rate row
- `Graduate Student Loan` -> 1 interest-rate row

Verification rule:

- Total interest-rate rows must equal 5.
- Every interest-rate document must reference a debt.
- No `other` debt may have an interest-rate document in Dataset Version 1.0.

### Scenario To Saved Projection Relationships

Required relationships:

- `Demo Debt Reduction Scenario` -> baseline `Demo Household Baseline`
- `Demo Income Increase Scenario` -> baseline `Demo Household Baseline`
- `Demo Emergency Expense Scenario` -> baseline `Demo Household Baseline`

Verification rule:

- Scenario projection documents must use `projection_type=scenario`.
- Scenario assumptions must preserve the baseline projection relationship in future full-document import.
- These relationships are documented but not imported in Phase 5.

### Projection Ownership References

Required projection anchors:

- `Demo Household Baseline` belongs to Dataset Version 1.0 baseline validation.
- The three scenario anchors belong to Dataset Version 1.0 scenario validation.

Verification rule:

- Saved projection titles must match the canonical titles exactly.
- Projection generated row parity is a future validation dependency, not a Phase 5 claim.

## Validation Anchor Values

These values are documented for future migration validation only. Phase 5 does not compare financial outputs.

| Saved Projection | Monthly Surplus | Cash Balance | Total Debt Balance | Total Debt Payments | Bills | Principal | Interest |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Demo Household Baseline | 8670.00 | 39070.00 | 45648.21 | 1295.00 | 635.00 | 1051.79 | 243.21 |
| Demo Debt Reduction Scenario | 8405.00 | 38805.00 | 45348.21 | 1595.00 | 600.00 | 1351.79 | 243.21 |
| Demo Income Increase Scenario | 9370.00 | 39770.00 | 45648.21 | 1295.00 | 635.00 | 1051.79 | 243.21 |
| Demo Emergency Expense Scenario | 8670.00 | 39070.00 | 45648.21 | 1295.00 | 635.00 | 1051.79 | 243.21 |

## Import Procedure

Version-controlled tooling:

- `scripts/datasetV1.js`: canonical Dataset Version 1.0 definition and expected counts.
- `scripts/importDataset.js`: preview/import command wrapper.
- `scripts/verifyDataset.js`: verification command wrapper.

Commands:

```powershell
npm run dataset:preview
npm run dataset:verify
npm run dataset:import
```

Current Phase 5 behavior:

- Preview reports expected counts, target collections, relationship counts, and validation anchors without writing MongoDB data.
- Verify reports expected counts when MongoDB is not configured and performs count/relationship checks when MongoDB is configured.
- Import is explicitly deferred and performs no writes.

## Phase 8 Pre-Import Attempt

Audit timestamp: 2026-06-04 13:32:41 -07:00

Phase 8 objective was to import Dataset Version 1.0 into a non-authoritative MongoDB validation environment and verify counts, relationships, retrieval routes, and idempotency.

### Pre-Import Environment

| Item | Result |
| --- | --- |
| Dataset Version | 1.0 |
| Git branch | `main` |
| Target database name | Not available; `MONGODB_URI` is not configured. |
| Connection string source | `MONGODB_URI` from process environment or `.env`; no value found. |
| Environment | `development` default; no `.env` file present in `migration/node-backend`. |
| Node version | v24.14.0 |
| Mongoose version | 9.6.3 |
| MongoDB version | Not available; MongoDB connection was not configured or reachable. |
| Local MongoDB listener | `127.0.0.1:27017` connection failed. |
| MongoDB CLI/service availability | `mongod`, `mongosh`, and Windows MongoDB service were not found. |

### Prerequisite Results

| Prerequisite | Result | Notes |
| --- | --- | --- |
| `MIGRATION_DATASET_AUDIT.md` exists | Pass | This audit document is present. |
| Dataset Version 1.0 exists | Pass | `scripts/datasetV1.js` exports `DATASET_VERSION = "1.0"`. |
| Dataset counts match audit | Pass | Expected counts: `accountBalances=4`, `incomeSources=5`, `debts=8`, `interestRates=5`, `savedProjections=4`, `scenarios=3`. |
| Relationship counts match audit | Pass | Expected relationships: income account refs 4, transfer account refs 2, debt account refs 8, interest-rate debt refs 5, scenario baseline refs 3. |
| `npm run dataset:preview` | Pass | Preview printed Dataset Version 1.0 expected counts and relationship counts. |
| `npm run dataset:verify` | Deferred | Returned `status: not-configured` because `MONGODB_URI` is not configured. |
| MongoDB connection succeeds | Fail | Required Phase 8 import precondition was not met. |

### Import Decision

Import was not attempted.

Reason:

- Phase 8 requires a successful MongoDB connection before import.
- `MONGODB_URI` was not configured.
- No local MongoDB listener or MongoDB CLI/service was available.

No MongoDB writes were performed. No collections were created, deleted, dropped, reset, patched, or manually edited.

### Collection Count Verification

Live collection counts were not available because MongoDB was not configured.

| Collection | Expected Count | Actual Count | Result |
| --- | ---: | ---: | --- |
| `accountBalances` | 4 | Not available | Deferred |
| `incomeSources` | 5 | Not available | Deferred |
| `debts` | 8 | Not available | Deferred |
| `interestRates` | 5 | Not available | Deferred |
| `savedProjections` | 4 | Not available | Deferred |
| Scenario documents in `savedProjections` | 3 | Not available | Deferred |

### Relationship Verification

Live relationship verification was not available because MongoDB was not configured.

| Relationship | Expected Count | Actual Count | Result |
| --- | ---: | ---: | --- |
| Income account references | 4 | Not available | Deferred |
| Transfer account references | 2 | Not available | Deferred |
| Debt account references | 8 | Not available | Deferred |
| Debt to interest-rate references | 5 | Not available | Deferred |
| Scenario to baseline saved-projection references | 3 | Not available | Deferred |

### Retrieval Verification

State C retrieval verification was not available because Dataset Version 1.0 was not imported.

Expected routes for future Phase 8 retry:

- `GET /account-balances`
- `GET /income-sources`
- `GET /debts`
- `GET /interest-rates/debt/:debtId`
- `GET /scenarios`
- `GET /projections`

### Idempotency Verification

Idempotency verification was not performed because import was blocked before any write operation.

Required future retry sequence:

1. Import Dataset Version 1.0.
2. Verify exact counts and relationships.
3. Delete imported Dataset Version 1.0 collections only.
4. Re-import Dataset Version 1.0.
5. Verify exact counts and relationships again.

### Failure Record

Failure reason:

- MongoDB connection prerequisite failed because no connection string was configured and no local MongoDB instance was reachable.

Collection state:

- Unknown/not available; no connection was established.

Recommended remediation:

1. Configure a non-authoritative MongoDB validation database.
2. Set `MONGODB_URI` for `migration/node-backend`.
3. Restart the Express migration backend and confirm `/health` reports `database: "connected"`.
4. Re-run Phase 8 from pre-import verification.

## Verification Procedure

Required checks:

1. Run `npm run dataset:preview`.
2. Confirm Dataset Version is `1.0`.
3. Confirm expected counts match this audit.
4. Confirm relationship counts are reported.
5. Run `npm run dataset:verify`.
6. If MongoDB is not configured, confirm verification reports `status: not-configured`.
7. If MongoDB is configured in a future phase, confirm actual counts match expected counts and relationships pass.

## Known Gaps

- MongoDB import is deferred.
- Full saved projection documents are not imported.
- Scenario documents are not imported.
- Generated rows are not imported.
- Projection assumptions are not imported.
- No calculation, projection, scenario, or financial validation is performed.
- No data parity is claimed.

## Future Validation Dependencies

Future phases must provide:

- Approved saved projection document fixtures or an approved projection-generation migration path.
- Exact route response parity checks against FastAPI.
- Calculation parity checks for validation anchor values.
- Scenario relationship validation after full scenario document migration.
- Dashboard and projection output validation after projection engine migration.
