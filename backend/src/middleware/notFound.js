function notFound(req, res) {
  res.status(404).json({
    status: 'not-found',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { notFound };
