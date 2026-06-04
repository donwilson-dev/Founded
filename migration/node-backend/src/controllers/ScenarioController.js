function scenarioPlaceholder(_req, res) {
  res.status(501).json({
    status: 'not-implemented',
    phase: 'phase-6-contract-scaffold',
  });
}

module.exports = { scenarioPlaceholder };
