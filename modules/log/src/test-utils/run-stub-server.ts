import { systemClock } from '@heynixie/clock';
import { startWriter } from '../start-writer';

const dataDir = process.argv.at(2);

if (dataDir === undefined) {
  throw new Error('usage: run-stub-server.ts <data directory>');
}

const writer = await startWriter({ dataDir });

console.log(`writer epoch ${writer.epoch}`);

for (;;) {
  await systemClock.sleep(1 << 30);
}
