const { createApp } = require('./src/app');
const { connectToDatabase } = require('./src/config/database');
const { config } = require('./src/config/env');

async function startServer() {
  await connectToDatabase(config.mongodbUri);

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`Founded Node migration backend listening on port ${config.port}`);
    console.log('Phase: phase-2-mongodb');
  });
}

startServer().catch((error) => {
  console.error(`Express startup failed: ${error.message}`);
  process.exit(1);
});
