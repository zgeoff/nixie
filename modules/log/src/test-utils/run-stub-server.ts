// Stands in for the server's start in the tests that run 2 processes on one data directory: it
// starts the writer on the directory in argv, prints its epoch, and runs until killed. A start that
// throws exits non-zero with the error on stderr, as the server does.
import { startWriter } from '../start-writer';

const dataDir = process.argv.at(2);

if (dataDir === undefined) {
  throw new Error('usage: run-stub-server.ts <data directory>');
}
const writer = await startWriter({ dataDir });

console.log(`writer epoch ${writer.epoch}`);
setInterval(() => {}, 1 << 30);
