type Line = Record<string, unknown>;

// The program table gives the median and p90 (nearest rank) of each image and program, in
// milliseconds, and the probe table gives each probe's exit and its first error line or last line.
export function formatSummary(programRuns: Line[], probeRuns: Line[]): string {
  const rows = [
    '## Programs',
    '',
    '| Image | Program | Code runs | Right | Total median | Total p90 | Program median | Program p90 |',
    '| --- | --- | --: | --: | --: | --: | --: | --: |',
  ];
  for (const image of new Set(programRuns.map((run) => String(run.image)))) {
    for (const program of new Set(programRuns.map((run) => String(run.program)))) {
      const cell = programRuns.filter((run) => run.image === image && run.program === program);
      const right = cell.filter((run) => run.code === 0 && run.matches === true).length;
      const runMs = collectNumbers(cell, 'runMs');
      const programMs = collectNumbers(cell, 'programMs');
      rows.push(
        `| ${image} | ${program} | ${cell.length} | ${right} | ${pickPercentile(runMs, 0.5)} | ${pickPercentile(runMs, 0.9)} | ${pickPercentile(programMs, 0.5)} | ${pickPercentile(programMs, 0.9)} |`,
      );
    }
  }

  rows.push(
    '',
    '## Probes',
    '',
    '| Image | Probe | Exit | Program ms | Error or last line |',
    '| --- | --- | --: | --: | --- |',
  );
  for (const probe of probeRuns) {
    // npm's last line names its log file, so the first error line says more.
    const lines = String(probe.output).split('\n');
    const shownLine = lines.find((line) => /ERR!|ERROR|Error|error:/.test(line)) ?? lines.at(-1) ?? '';
    rows.push(
      `| ${String(probe.image)} | ${String(probe.probe)} | ${String(probe.code)} | ${String(probe.programMs)} | ${shownLine.replaceAll('|', '\\|').slice(0, 120)} |`,
    );
  }

  return `${rows.join('\n')}\n`;
}

function collectNumbers(lines: Line[], key: string): number[] {
  return lines.map((line) => line[key]).filter((value): value is number => typeof value === 'number');
}

function pickPercentile(values: number[], fraction: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? Number.NaN;
}
