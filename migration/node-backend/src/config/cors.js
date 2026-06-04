const allowedOrigins = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
};

module.exports = { allowedOrigins, corsOptions };
