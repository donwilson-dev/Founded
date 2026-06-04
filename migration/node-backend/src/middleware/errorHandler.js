function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const response = {
    status: 'error',
    message: statusCode === 500 ? 'Internal server error' : error.message,
  };

  if (process.env.NODE_ENV !== 'production') {
    response.detail = error.message;
  }

  res.status(statusCode).json(response);
}

module.exports = { errorHandler };
