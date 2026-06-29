const mongoose = require('mongoose');

const databaseStatus = {
  configured: false,
  state: 'not-configured',
};

function getDatabaseStatus() {
  if (!databaseStatus.configured) {
    return 'not-configured';
  }

  if (mongoose.connection.readyState === 1) {
    return 'connected';
  }

  return databaseStatus.state;
}

async function connectToDatabase(uri) {
  if (!uri) {
    databaseStatus.configured = false;
    databaseStatus.state = 'not-configured';
    console.log('MongoDB connection not configured');
    return getDatabaseStatus();
  }

  databaseStatus.configured = true;
  databaseStatus.state = 'connecting';

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    databaseStatus.state = 'connected';
    console.log('MongoDB connected');
  } catch (error) {
    databaseStatus.state = 'connection-failed';
    console.warn(`MongoDB connection skipped: ${error.message}`);
  }

  return getDatabaseStatus();
}

async function disconnectFromDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  databaseStatus.state = databaseStatus.configured ? 'disconnected' : 'not-configured';
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  getDatabaseStatus,
};
