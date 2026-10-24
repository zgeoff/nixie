import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promptRegistry } from './prompt-registry';

test.each(Object.entries(promptRegistry))(
  "it lists the %s prompt's parts and paths in the override guide",
  async (id, entry) => {
    const guide = await readFile(
      join(import.meta.dir, '..', '..', '..', 'docs', 'guides', 'overriding-a-prompt.md'),
      'utf8',
    );

    const row = guide
      .split('\n')
      .find((line) => line.startsWith(`| \`${id}\` `))
      ?.split('|')
      .map((cell) => cell.trim());

    expect(row).toStrictEqual([
      '',
      `\`${id}\``,
      Object.keys(entry.parts)
        .map((part) => `\`${part}\``)
        .join(', '),
      entry.paths.length === 0 ? 'none' : entry.paths.map((path) => `\`${path}\``).join(', '),
      '',
    ]);
  },
);
