const assert = require('node:assert/strict');
const test = require('node:test');

const { incomeResponse } = require('../src/controllers/IncomeController');

test('incomeResponse exposes legacy IDs for frontend workflows', () => {
  const response = incomeResponse({
    _id: '665fca100000000000000001',
    legacyId: 42,
    account_balance_id: '665fca100000000000000002',
    legacy_account_balance_id: 7,
    from_account_id: null,
    legacy_from_account_id: null,
    to_account_id: null,
    legacy_to_account_id: null,
    label: 'Paycheck',
  });

  assert.equal(response.id, 42);
  assert.equal(response.account_balance_id, 7);
  assert.equal(response.from_account_id, null);
  assert.equal(response.to_account_id, null);
});

test('incomeResponse exposes transfer account legacy IDs', () => {
  const response = incomeResponse({
    _id: '665fca100000000000000003',
    legacyId: 43,
    account_balance_id: null,
    legacy_account_balance_id: null,
    from_account_id: '665fca100000000000000004',
    legacy_from_account_id: 9,
    to_account_id: '665fca100000000000000005',
    legacy_to_account_id: 10,
    label: 'Transfer',
  });

  assert.equal(response.id, 43);
  assert.equal(response.account_balance_id, null);
  assert.equal(response.from_account_id, 9);
  assert.equal(response.to_account_id, 10);
});
