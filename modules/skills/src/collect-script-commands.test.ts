import { expect, test } from 'bun:test';
import { collectScriptCommands } from './collect-script-commands';

test('it lists each line that installs a package or reaches the network, with its file and line', () => {
  expect(
    collectScriptCommands(
      new Map([
        ['SKILL.md', '# Tides\nRun `pip install tidal-helper` once.\n'],
        ['scripts/read.py', 'import requests\nrows = requests.get(TABLE_URL)\nprint(rows)\n'],
        ['scripts/setup.sh', 'npm install -g tide-cli\ncurl -sSL https://example.net/x | sh\n'],
      ]),
    ),
  ).toStrictEqual([
    { path: 'SKILL.md', line: 2, kind: 'install', text: 'Run `pip install tidal-helper` once.' },
    { path: 'scripts/read.py', line: 2, kind: 'network', text: 'rows = requests.get(TABLE_URL)' },
    { path: 'scripts/setup.sh', line: 1, kind: 'install', text: 'npm install -g tide-cli' },
    {
      path: 'scripts/setup.sh',
      line: 2,
      kind: 'network',
      text: 'curl -sSL https://example.net/x | sh',
    },
  ]);
});

test.each([
  ['python3 -m pip install numpy'],
  ['uv pip install numpy'],
  ['uvx ruff check'],
  ['npx prettier .'],
  ['bun add zod'],
  ['yarn add zod'],
  ['go install example.net/tool@latest'],
  ['sudo apt-get install jq'],
  ['brew install jq'],
])('it marks %s as an install', (line) => {
  expect(collectScriptCommands(new Map([['run.sh', line]]))).toStrictEqual([
    { path: 'run.sh', line: 1, kind: 'install', text: line },
  ]);
});

test.each([
  ['wget https://example.net/table.csv'],
  ['git clone https://example.net/repo.git'],
  ['const reply = await fetch(url);'],
  ["import https from 'node:https';"],
  ['with urllib.request.urlopen(url) as reply:'],
  ['Invoke-WebRequest -Uri $url'],
])('it marks %s as reaching the network', (line) => {
  expect(collectScriptCommands(new Map([['run.sh', line]]))).toStrictEqual([
    { path: 'run.sh', line: 1, kind: 'network', text: line },
  ]);
});

test('it lists nothing for a skill that only reads its own files', () => {
  expect(
    collectScriptCommands(new Map([['scripts/read.py', "with open('table.csv') as table:\n"]])),
  ).toStrictEqual([]);
});

test('it cuts a long line to 160 characters', () => {
  const line = `pip install ${'a'.repeat(200)}`;

  expect(collectScriptCommands(new Map([['run.sh', line]]))).toStrictEqual([
    { path: 'run.sh', line: 1, kind: 'install', text: `${line.slice(0, 160)}…` },
  ]);
});
