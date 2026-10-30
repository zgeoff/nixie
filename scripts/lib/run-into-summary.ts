import { appendFileSync } from 'node:fs';
import { $ } from 'bun';

// The step's log and its summary each get the command's output, as `tee -a` gives them.
export async function runIntoSummary(
  argv: readonly string[],
  summaryPath: string,
): Promise<number> {
  const result = await $`${argv}`.nothrow().quiet();

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  appendFileSync(summaryPath, result.stdout);

  return result.exitCode;
}
