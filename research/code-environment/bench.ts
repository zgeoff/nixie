// The driver: runs each program and each probe in each image under the code tool's default limits,
// and writes one line per run to results/programs.jsonl and results/probes.jsonl.
// Usage: SPIKE_IMAGES=<image>,<image> bun bench.ts [samples]
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// oxlint-disable no-await-in-loop -- runs go one at a time, so no run's time includes another's

const programs = [
  { name: 'node', command: ['node', '/work/in/report.mjs'] },
  { name: 'python', command: ['python3', '/work/in/report.py'] },
  { name: 'shell', command: ['bash', '/work/in/report.sh'] },
];

// Each probe records what one image holds or refuses; results.md gives the outcome each one expects.
const probes = [
  { name: 'node version', command: 'node --version' },
  { name: 'npm version', command: 'npm --version' },
  { name: 'python version', command: 'python3 --version' },
  { name: 'pip version', command: 'pip --version' },
  { name: 'toolbox versions', command: 'jq --version; rg --version | head -1; awk --version | head -1; sed --version | head -1; grep --version | head -1; file --version | head -1; curl --version | head -1; bash --version | head -1' },
  { name: 'node start', command: 'node -e 0' },
  { name: 'python start', command: 'python3 -c pass' },
  { name: 'node standard modules', command: "node -e \"for (const name of ['zlib', 'crypto', 'worker_threads', 'child_process']) require('node:' + name)\"" },
  { name: 'node sqlite', command: "node -e \"require('node:sqlite')\"" },
  { name: 'python standard modules', command: 'python3 -c "import csv, decimal, hashlib, json, sqlite3, statistics, zipfile, venv"' },
  { name: 'python numpy', command: 'python3 -c "import numpy"' },
  { name: 'python pandas', command: 'python3 -c "import pandas"' },
  { name: 'python requests', command: 'python3 -c "import requests"' },
  { name: 'node lodash', command: "node -e \"require('lodash')\"" },
  { name: 'pip install', command: 'pip install --user requests' },
  { name: 'pip install in a venv', command: 'python3 -m venv /tmp/venv && /tmp/venv/bin/pip install --timeout 5 --retries 0 requests' },
  { name: 'npm install', command: 'cd /tmp && npm install --fetch-retries 0 --fetch-timeout 5000 lodash' },
  { name: 'curl', command: 'curl --silent --show-error --max-time 5 https://example.com/' },
];

// The code tool's defaults from the coding design: 1 vCPU, 1 GiB, no network. The programs and their
// input are mounted read-only, and the program writes its files to a tmpfs.
const limits = ['--network', 'none', '--cpus', '1', '--memory', '1g', '--memory-swap', '1g'];

// Each run times itself inside the container, so the program's own time leaves out Docker's start.
const timer = 'start=$(date +%s%N); "$@"; code=$?; echo "elapsed_ns=$(( $(date +%s%N) - start ))" >&2; exit $code';

const images = (process.env.SPIKE_IMAGES ?? '').split(',').filter(Boolean);
const samples = Number(process.argv[2] ?? '5');
const expected = JSON.stringify(JSON.parse(readFileSync('programs/expected.json', 'utf8')));
if (images.length === 0) {
  throw new Error('set SPIKE_IMAGES to the images to run in');
}

for (let sample = 1; sample <= samples; sample += 1) {
  for (const image of sample % 2 === 0 ? images.toReversed() : images) {
    for (const program of programs) {
      const result = await runInImage(image, [...program.command, '/work/in/orders.csv', '/work/out']);
      writeResult('programs', {
        image,
        program: program.name,
        sample,
        code: result.code,
        matches: result.stdout.trim() === expected,
        runMs: result.runMs,
        programMs: result.programMs,
        stderr: result.stderr,
      });
    }
  }
}

for (const image of images) {
  for (const probe of probes) {
    const result = await runInImage(image, ['bash', '-c', probe.command]);
    writeResult('probes', {
      image,
      probe: probe.name,
      code: result.code,
      programMs: result.programMs,
      output: `${result.stdout}${result.stderr}`.trim().split('\n').slice(-8).join('\n'),
    });
  }
}

async function runInImage(image: string, command: string[]) {
  const origin = performance.now();
  const child = Bun.spawn(
    [
      'docker', 'run', '--rm', ...limits,
      '--tmpfs', '/work/out:uid=1000,gid=1000',
      '--tmpfs', '/tmp:uid=1000,gid=1000,exec',
      '--volume', `${join(import.meta.dir, 'programs')}:/work/in:ro`,
      '--entrypoint', 'bash', image, '-c', timer, 'timer', ...command,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const elapsed = /elapsed_ns=(\d+)\s*$/.exec(stderr);
  return {
    code,
    stdout,
    stderr: stderr.replace(/elapsed_ns=\d+\s*$/, '').trim(),
    runMs: Math.round(performance.now() - origin),
    programMs: elapsed?.[1] === undefined ? undefined : Math.round(Number(elapsed[1]) / 1e6),
  };
}

function writeResult(file: string, line: Record<string, unknown>) {
  appendFileSync(join('results', `${file}.jsonl`), `${JSON.stringify(line)}\n`);
}
