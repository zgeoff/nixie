// Builds report.html from a run's runs.jsonl and judged.jsonl.
// Usage: bun agent/report.ts results/<name>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Entry {
  label: string;
}

interface Verdict {
  bins_honest?: boolean;
  crown_ambiguity?: boolean;
  dinner_honest?: boolean;
  draft_honest?: boolean;
  entries?: Entry[];
  false_claims?: number;
  gender_assumed?: boolean;
  loops_found?: string[];
  loops_invented?: string[];
  m1_updated?: boolean;
  recap_honest?: boolean;
  saturday_correct?: boolean;
}

interface Judged {
  evidence?: { checked: number; missing: number; quotes: string[] };
  key: string;
  verdict: Verdict;
}

interface Run {
  calls: { args: object; name: string; result: { isError: boolean; text: string } }[];
  config: string;
  durationMs: number;
  error?: string;
  memory: { fact: string; id: string; source?: string }[];
  sample: number;
  task: string;
  transcript: string;
  turns: { label: string; outputTokens: number; prompt: string; reply: string }[];
  variant: string;
}

function readLines<T>(path: string): T[] {
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T)
    : [];
}

function formatHtml(value: unknown): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function getKey(run: Run): string {
  return [run.task, run.config, run.variant, run.transcript, run.sample].join('|');
}

function buildAverage(values: number[]): string {
  return values.length > 0
    ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
    : '–';
}

function buildPercent(values: (boolean | undefined)[]): string {
  const known = values.filter((value) => value !== undefined);
  return known.length > 0
    ? `${Math.round((known.filter(Boolean).length / known.length) * 100)}%`
    : '–';
}

function countLabel(verdict: Verdict, label: string): number {
  return (verdict.entries ?? []).filter((entry) => entry.label === label).length;
}

function buildTable(head: string[], rows: string[][]): string {
  return `<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function collectGroups<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  }
  return new Map([...groups.entries()].toSorted(([a], [b]) => a.localeCompare(b)));
}

function buildMemoryRows(pairs: [Run, Judged][], group: (run: Run) => string): string[][] {
  return [...collectGroups(pairs, ([run]) => group(run)).entries()].map(([name, items]) => {
    const evidence = items
        .map(([, judged]) => judged.evidence)
        .filter((item) => item && item.checked > 0),
      verdicts = items.map(([, judged]) => judged.verdict);
    return [
      name,
      String(items.length),
      buildAverage(verdicts.map((verdict) => (verdict.entries ?? []).length)),
      buildAverage(
        verdicts.map(
          (verdict) => countLabel(verdict, 'supported') + countLabel(verdict, 'inferred_ok'),
        ),
      ),
      buildAverage(verdicts.map((verdict) => countLabel(verdict, 'invented'))),
      buildAverage(verdicts.map((verdict) => countLabel(verdict, 'misattributed'))),
      buildPercent(verdicts.map((verdict) => verdict.m1_updated)),
      buildAverage(verdicts.map((verdict) => (verdict.loops_found ?? []).length)),
      buildAverage(verdicts.map((verdict) => (verdict.loops_invented ?? []).length)),
      String(verdicts.filter((verdict) => verdict.gender_assumed).length),
      evidence.length > 0
        ? `${evidence.reduce((sum, item) => sum + (item?.missing ?? 0), 0)} / ${evidence.reduce((sum, item) => sum + (item?.checked ?? 0), 0)}`
        : '–',
      `${buildAverage(items.map(([run]) => run.durationMs / 1000))} s`,
    ];
  });
}

function buildDayRows(pairs: [Run, Judged][]): string[][] {
  return [...collectGroups(pairs, ([run]) => run.config).entries()].map(([name, items]) => {
    const verdicts = items.map(([, judged]) => judged.verdict);
    return [
      name,
      String(items.length),
      buildAverage(verdicts.map((verdict) => verdict.false_claims ?? 0)),
      buildPercent(verdicts.map((verdict) => verdict.saturday_correct)),
      buildPercent(verdicts.map((verdict) => verdict.crown_ambiguity)),
      buildPercent(verdicts.map((verdict) => verdict.dinner_honest)),
      buildPercent(verdicts.map((verdict) => verdict.draft_honest)),
      buildPercent(verdicts.map((verdict) => verdict.bins_honest)),
      buildPercent(verdicts.map((verdict) => verdict.recap_honest)),
      buildAverage(items.map(([run]) => run.calls.length)),
      `${buildAverage(items.map(([run]) => run.durationMs / 1000 / run.turns.length))} s`,
    ];
  });
}

function buildDetail(run: Run, judged: Judged | undefined): string {
  const calls = run.calls
      .map(
        (call) =>
          `<li><code>${formatHtml(call.name)}</code> ${formatHtml(JSON.stringify(call.args))} → ${call.result.isError ? '<b class="bad">' : ''}${formatHtml(call.result.text)}${call.result.isError ? '</b>' : ''}</li>`,
      )
      .join(''),
    memory = run.memory
      .map(
        (entry) =>
          `<li>${formatHtml(entry.id)} [${formatHtml(entry.source ?? '')}] ${formatHtml(entry.fact)}</li>`,
      )
      .join(''),
    turns = run.turns
      .map(
        (turn) =>
          `<div class="turn"><div class="label">${formatHtml(turn.label)}</div><div class="owner">${formatHtml(turn.prompt.slice(0, 300))}${turn.prompt.length > 300 ? '…' : ''}</div><div class="reply">${formatHtml(turn.reply)}</div></div>`,
      )
      .join('');
  return `<details><summary>${formatHtml(getKey(run))}${run.error ? ` <b class="bad">${formatHtml(run.error)}</b>` : ''}</summary>
<h4>Tool calls</h4><ol>${calls}</ol>${run.task === 'memory' ? `<h4>Memory after</h4><ul>${memory}</ul>` : ''}
<h4>Turns</h4>${turns}<h4>Judge</h4><pre>${formatHtml(JSON.stringify(judged ?? {}, null, 2))}</pre></details>`;
}

function buildPage(runs: Run[], judged: Map<string, Judged>): string {
  const allPairs = runs.flatMap((run): [Run, Judged][] => {
      const verdict = judged.get(getKey(run));
      return verdict ? [[run, verdict]] : [];
    }),
    day = allPairs.filter(([run]) => run.task === 'day'),
    memory = allPairs.filter(([run]) => run.task === 'memory'),
    memoryHead = [
      'Group',
      'Runs',
      'Entries',
      'Supported',
      'Invented',
      'Misattributed',
      'Outdated entry updated',
      'Loops found (of 4)',
      'Loops invented',
      'Gender assumed',
      'Bad quotes',
      'Time',
    ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Agent eval</title>
<style>:root{--bg:#f7f7f5;--card:#fff;--text:#1d1d1b;--muted:#6b6b66;--line:#deded8;--bad:#c92a2a}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--text:#ecece8;--muted:#9a9a93;--line:#34342f;--bad:#ff6b6b}}
body{margin:0;padding:16px;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif}
table{border-collapse:collapse;margin:8px 0 24px;background:var(--card)}th,td{border:1px solid var(--line);padding:4px 8px;text-align:right}
th:first-child,td:first-child{text-align:left}details{background:var(--card);border:1px solid var(--line);border-radius:6px;margin:4px 0;padding:6px 10px}
.turn{border-top:1px solid var(--line);padding:6px 0}.label{color:var(--muted);font-size:12px}.owner{color:var(--muted);white-space:pre-wrap}
.reply{white-space:pre-wrap}.bad{color:var(--bad)}pre{white-space:pre-wrap;font-size:12px}.note{color:var(--muted)}</style></head><body>
<h1>Agent eval: ${formatHtml(dir)}</h1>
<p class="note">${allPairs.length} judged runs of ${runs.length}. Entry counts are averages per run. Bad quotes: evidence quotes not found in the owner's lines, over quotes checked.</p>
<h2>Memory: by model</h2>${buildTable(
    memoryHead,
    buildMemoryRows(memory, (run) => run.config),
  )}
<h2>Memory: by model and prompt</h2>${buildTable(
    memoryHead,
    buildMemoryRows(memory, (run) => `${run.config} · ${run.variant}`),
  )}
<h2>Memory: by model and transcript type</h2>${buildTable(
    memoryHead,
    buildMemoryRows(memory, (run) => `${run.config} · ${run.transcript.split('-')[0]}`),
  )}
<h2>Day with tools</h2>${buildTable(['Model', 'Runs', 'False claims', 'Saturday', 'Crown ambiguity', 'Dinner honest', 'Draft honest', 'Bins honest', 'Recap honest', 'Tool calls', 'Time per turn'], buildDayRows(day))}
<h2>Every run</h2>${runs.map((run) => buildDetail(run, judged.get(getKey(run)))).join('\n')}
</body></html>`;
}

const dir = process.argv[2] ?? '',
  judged = new Map(readLines<Judged>(join(dir, 'judged.jsonl')).map((row) => [row.key, row])),
  runs = readLines<Run>(join(dir, 'runs.jsonl')).toSorted((a, b) =>
    getKey(a).localeCompare(getKey(b)),
  );
writeFileSync(join(dir, 'report.html'), buildPage(runs, judged));
console.log(`wrote ${join(dir, 'report.html')} with ${runs.length} runs`);
