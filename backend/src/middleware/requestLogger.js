function requestLogger(req, _res, next) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${req.method} ${req.originalUrl}`);
  }
  next();
}

module.exports = { requestLogger };
