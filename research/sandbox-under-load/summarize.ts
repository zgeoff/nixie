// Prints the tables in results.md from rotation.jsonl and parallel.jsonl in a results directory.
// Usage: bun summarize.ts [results_dir], with results/ beside this file by default.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, define } from 'gunshi';
import { z } from 'zod';

const EVENT_SCHEMA = z.looseObject({
  at: z.number(),
  source: z.string(),
  event: z.string(),
});

type RunEvent = z.infer<typeof EVENT_SCHEMA>;

const summaryCommand = define({
  name: 'summary',
  description: "Prints the rotation timeline and the parallel calls table from a run's results",
  args: {
    results: {
      type: 'positional',
      required: false,
      description: 'the results directory, results/ beside this file by default',
    },
  },
  run: (ctx) => {
    const results = ctx.values.results ?? join(import.meta.dir, 'results');

    console.log(formatRotation(readEvents(results, 'rotation')));
    console.log(formatParallel(readEvents(results, 'parallel')));
  },
});

await cli(process.argv.slice(2), summaryCommand);

function readEvents(results: string, scenario: string): RunEvent[] {
  return readFileSync(join(results, `${scenario}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => EVENT_SCHEMA.parse(JSON.parse(line)));
}

function formatRotation(events: RunEvent[]): string {
  const start = events.find((event) => event.event === 'query')?.at ?? 0;
  const kept = events.filter(
    (event) =>
      (event.source === 'rotation' && event.event === 'done') ||
      event.source === 'probe' ||
      ['tool_results', 'message_start', 'api_retry', 'result'].includes(event.event),
  );
  const rows = kept.map((event) => `| ${String(event.at - start)} | ${formatDetail(event)} |`);

  return ['| ms from query() | Event |', '| --: | --- |', ...rows].join('\n');
}

function formatDetail(event: RunEvent): string {
  const { at: _at, source, event: name, guestMs: _guestMs, ...fields } = event;

  return `${source} ${name} ${JSON.stringify(fields).slice(0, 120)}`;
}

function formatParallel(events: RunEvent[]): string {
  const calls = events.filter((event) => event.source === 'tools');
  const tools = ['wait_read_only', 'wait'];
  const rows = tools.map((tool) => {
    const started = calls.filter((event) => event.event === 'call_start' && event.name === tool);
    const counts = new Set(started.map((event) => event.count));
    const ended = calls.filter((event) => event.event === 'call_end' && counts.has(event.count));
    const first = Math.min(...started.map((event) => event.at));
    const last = Math.max(...ended.map((event) => event.at));
    const peak = Math.max(...started.map((event) => Number(event.inFlight)));

    return `| ${tool} | ${String(started.length)} | ${String(peak)} | ${String(last - first)} |`;
  });

  return [
    '',
    '| Tool | Calls | Most in flight | First start to last end, ms |',
    '| --- | --: | --: | --: |',
    ...rows,
  ].join('\n');
}
