import { writeTaskYAMLSamples } from './runtime-task/write-task-yaml-samples';

const [directory] = process.argv.slice(2);

if (directory === undefined) {
  process.stderr.write('usage: bun run-task-yaml-samples.ts <directory>\n');
  process.exit(2);
}

const written = await writeTaskYAMLSamples(directory);

process.stdout.write(`wrote ${String(written.length)} task.yaml samples to ${directory}\n`);
