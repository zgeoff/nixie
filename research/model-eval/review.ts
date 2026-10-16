// Builds a review page from a matrix run: one section per prompt, personas as rows, models as columns.
// Usage: bun review.ts results/<run_name>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dir;

// Splits prompts.md on its `##` headings into a map from prompt id to prompt text.
function readPrompts(): Map<string, string> {
  const sections = readFileSync(join(here, 'prompts.md'), 'utf8').split(/^## /mu).slice(1);
  return new Map(
    sections.map((section) => {
      const [id = '', ...body] = section.split('\n');
      return [id.trim(), body.join('\n').trim()];
    }),
  );
}

function readRows(dir: string): Record<string, unknown>[] {
  const prompts = readPrompts(),
    rows = readFileSync(join(dir, 'results.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  for (const row of rows) {
    row.promptText ??= prompts.get(String(row.prompt));
  }
  return rows;
}

// Escapes `<` so that a reply holding `</script>` cannot end the page's script block.
function renderPage(dir: string, rows: Record<string, unknown>[]): string {
  const data = JSON.stringify(rows).replaceAll('<', String.raw`\u003c`);
  return readFileSync(join(here, 'review.html'), 'utf8')
    .replaceAll('__RUN__', dir)
    .replace('__DATA__', () => data);
}

function run(dir: string | undefined): void {
  if (!dir) {
    throw new Error('usage: review.ts results/<run_name>');
  }
  const rows = readRows(dir);
  writeFileSync(join(dir, 'review.html'), renderPage(dir, rows));
  console.log(`wrote ${join(dir, 'review.html')} with ${rows.length} replies`);
}

run(process.argv.at(2));
