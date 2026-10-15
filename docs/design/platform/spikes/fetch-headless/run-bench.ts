// Runs each read in a new container held to the fetch sandbox's limits (1 vCPU, 512 MiB, no swap),
// one at a time, and appends each result line to the output file.
//   bun run-bench.ts <output.jsonl> <full|shell>:<plain|masked>[,...] <url> [<url>...]
import { appendFile } from 'node:fs/promises';

const [output = '', combosText = '', ...urls] = process.argv.slice(2);
const combos = combosText.split(',').map((combo) => combo.split(':') as [string, string]);

const limits = ['--cpus=1', '--memory=512m', '--memory-swap=512m'];

for (const url of urls) {
  for (const [engine, variant] of combos) {
    const started = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- one read at a time, as the fetch sandbox runs them
    const line = await runRead(engine, variant, url);
    const containerMs = Math.round(performance.now() - started);

    // oxlint-disable-next-line no-await-in-loop -- results land in run order
    await appendFile(output, `${JSON.stringify({ ...line, containerMs })}\n`);
    console.log(engine, variant, url, line['passed'], line['passMs'] ?? line['error']);
  }
}

async function runRead(engine: string, variant: string, url: string): Promise<Record<string, unknown>> {
  const child = Bun.spawn(
    ['docker', 'run', '--rm', ...limits, `fetch-headless:${engine}`, 'read-in-browser.ts', url, variant, '30000'],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const last = stdout.trim().split('\n').at(-1) ?? '';

  if (code !== 0 || !last.startsWith('{')) {
    return { url, engine, variant, passed: false, error: `exit ${code}: ${stderr.trim().split('\n').at(-1) ?? ''}` };
  }

  return JSON.parse(last) as Record<string, unknown>;
}
