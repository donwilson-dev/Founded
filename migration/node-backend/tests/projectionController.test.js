const assert = require('node:assert/strict');
const test = require('node:test');

const { baselineReferenceValues } = require('../src/controllers/ProjectionController');

test('baselineReferenceValues includes legacy and native projection identifiers', () => {
  const values = baselineReferenceValues({
    _id: '665fca100000000000000001',
    id: '665fca100000000000000001',
    legacyId: 42,
  });

  assert.deepEqual(values, [42, '42', '665fca100000000000000001']);
});
