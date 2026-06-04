const { createApp } = require('./src/app');
const { config } = require('./src/config/env');

const app = createApp();

app.listen(config.port, () => {
  console.log(`Founded Node migration backend listening on port ${config.port}`);
  console.log('Phase: phase-1-skeleton');
});
