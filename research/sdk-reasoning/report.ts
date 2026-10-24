// Prints the results table from the run files in runs/: per profile and thinking setting, the display
// the CLI asked the API for, the thinking tokens, and the bytes of thinking text and signature that
// the API sent, the SDK passed on and the CLI's transcript kept.
//
//   bun report.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

interface Block {
  type: string;
  textBytes: number;
  signatureBytes: number;
  dataBytes: number;
}

interface Run {
  profile: string;
  setting: string;
  apiCalls: { thinking: { display?: string } | null; blocks: Block[]; usage: { output_tokens?: number } }[];
  sdkBlocks: Block[];
  transcriptBlocks: Block[];
  result: { modelUsage: Record<string, { thinkingTokens?: number }> } | null;
}

const dir = join(import.meta.dir, 'runs');
const runs: Run[] = [];

for (const file of (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()) {
  runs.push(await Bun.file(join(dir, file)).json());
}

const sum = (blocks: Block[], type: string, field: keyof Omit<Block, 'type'>): number =>
  blocks.filter((block) => block.type === type).reduce((total, block) => total + block[field], 0);

const rows = runs.map((run) => {
  const apiBlocks = run.apiCalls.flatMap((call) => call.blocks);
  const thinkingTokens = Object.values(run.result?.modelUsage ?? {}).reduce(
    (total, usage) => total + (usage.thinkingTokens ?? 0),
    0,
  );

  return [
    run.profile,
    run.setting,
    run.apiCalls.map((call) => call.thinking?.display ?? 'none').join(', '),
    String(run.apiCalls.reduce((total, call) => total + (call.usage.output_tokens ?? 0), 0)),
    String(thinkingTokens),
    String(sum(apiBlocks, 'thinking', 'textBytes')),
    String(sum(run.sdkBlocks, 'thinking', 'textBytes')),
    String(sum(run.transcriptBlocks, 'thinking', 'textBytes')),
    String(sum(run.sdkBlocks, 'thinking', 'signatureBytes')),
    String(sum(run.sdkBlocks, 'redacted_thinking', 'dataBytes')),
    String(sum(run.sdkBlocks, 'text', 'textBytes')),
  ];
});
const header = [
  'Profile',
  'Setting',
  'Display sent',
  'Output tokens',
  'Thinking tokens',
  'API thinking bytes',
  'SDK thinking bytes',
  'Transcript thinking bytes',
  'Signature bytes',
  'Redacted bytes',
  'Reply bytes',
];

console.log(`| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);
for (const row of rows) {
  console.log(`| ${row.join(' | ')} |`);
}
