const { main: runCli } = require('../../cli');
const { getDataSourceOption } = require('../../../config/environment');

async function main() {
  const country = getDataSourceOption('importgenius', 'IMPORTGENIUS_COUNTRY', 'usa');
  await runCli(['import', '--country', country, ...process.argv.slice(2)]);
}

main()
  .catch(error => {
    console.error('ImportGenius import failed:', error.message);
    process.exitCode = 1;
  });
