const { preview } = require('./datasetV1');

function printPreview() {
  console.log(JSON.stringify(preview(), null, 2));
}

function printUsage() {
  console.log('Usage: node scripts/importDataset.js [preview|import]');
}

function main() {
  const command = process.argv[2] || 'preview';

  if (command === 'preview') {
    printPreview();
    return;
  }

  if (command === 'import') {
    console.error('Dataset import is deferred in Phase 5.');
    console.error('No MongoDB writes were performed.');
    console.error('Reason: saved projection and scenario documents are validation anchors only until future projection/scenario migration approval.');
    process.exitCode = 2;
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
