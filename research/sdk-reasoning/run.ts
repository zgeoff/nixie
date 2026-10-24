// Runs one extended-thinking turn for each model profile and thinking setting, with the options the
// conversation guest builds, and writes runs/<profile>-<setting>.json: the blocks the API streamed
// back, the blocks the SDK's assistant messages carried, and the thinking the CLI's transcript kept.
//
//   bun run.ts [profile ...]
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options, SDKMessage, ThinkingConfig } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { buildQueryOptions, type TurnFrame } from '../../../../../guests/conversation/src/build-query-options';
import { startCaptureProxy } from './start-capture-proxy';

type Effort = TurnFrame['profile']['effort'];

// the profiles the deployment's role map names, by model and effort
const profiles: Record<string, { model: string; effort: Effort }> = {
  'opus-medium': { model: 'claude-opus-5-5', effort: 'medium' },
  'sonnet-high': { model: 'claude-sonnet-5-5', effort: 'high' },
  'haiku-low': { model: 'claude-haiku-5-5', effort: 'low' },
};

// production sets no thinking option; the other two ask for each display the SDK offers
const settings: Record<string, ThinkingConfig | undefined> = {
  production: undefined,
  summarized: { type: 'adaptive', display: 'summarized' },
  omitted: { type: 'adaptive', display: 'omitted' },
};

// an invented question that needs a few steps of working
const prompt = [
  'A ferry leaves the north pier at 07:40 and then every 35 minutes. The crossing takes 22 minutes,',
  'and the bus from the south pier leaves at 10 and 40 past each hour. I need to be on a bus by 11:00',
  'at the latest, and I cannot reach the north pier before 08:55. Which ferry should I take, and how',
  'long will I wait at the south pier? Answer in two sentences.',
].join(' ');

interface Block {
  readonly type: string;
  readonly textBytes: number;
  readonly signatureBytes: number;
  readonly dataBytes: number;
  readonly text: string;
}

const dir = import.meta.dir;
const chosen = process.argv.slice(2);
const proxy = startCaptureProxy();

await mkdir(join(dir, 'runs'), { recursive: true });
for (const [profileID, profile] of Object.entries(profiles)) {
  if (chosen.length > 0 && !chosen.includes(profileID)) {
    continue;
  }
  for (const [settingID, thinking] of Object.entries(settings)) {
    const run = await runTurn(profile.model, profile.effort, thinking);

    await Bun.write(
      join(dir, 'runs', `${profileID}-${settingID}.json`),
      `${JSON.stringify({ profile: profileID, ...profile, setting: settingID, thinking: thinking ?? null, ranAt: new Date().toISOString(), ...run }, null, 2)}\n`,
    );
    console.log(`${profileID} ${settingID}: ${run.sdkBlocks.map((block) => block.type).join(', ')}`);
  }
}
await proxy.stop();

async function runTurn(model: string, effort: Effort, thinking: ThinkingConfig | undefined) {
  const home = await mkdtemp(join(tmpdir(), 'sdk-reasoning-'));
  const firstCall = proxy.calls.length;
  const turn: TurnFrame = {
    type: 'turn',
    profile: { model, baseURL: proxy.url, effort, authHeader: 'bearer', contextTokens: null },
    tools: { url: 'http://127.0.0.1:1', token: 'unused' },
    resume: null,
    systemPrompt: 'You are nixie, a personal assistant that works for one person.',
    input: [{ uuid: crypto.randomUUID(), text: prompt }],
  };
  const toolServer = createSdkMcpServer({ name: 'nixie', tools: [] });
  const base = buildQueryOptions(turn, {
    env: { ...process.env, HOME: home, ANTHROPIC_AUTH_TOKEN: 'placeholder' },
    toolServer,
  });
  const options: Options = thinking === undefined ? base : { ...base, thinking };
  const sdkBlocks: Block[] = [];
  const thinkingTokenEvents: number[] = [];
  let result: Record<string, unknown> | null = null;

  await mkdir(join(home, 'conversation'), { recursive: true });
  for await (const message of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
    if (message.type === 'assistant' && message.parent_tool_use_id === null) {
      for (const block of message.message.content as any[]) {
        sdkBlocks.push(describeBlock(block));
      }
    } else if (message.type === 'system' && message.subtype === 'thinking_tokens') {
      thinkingTokenEvents.push(message.estimated_tokens);
    } else if (message.type === 'result') {
      result = {
        subtype: message.subtype,
        isError: message.is_error,
        usage: message.usage,
        modelUsage: message.modelUsage,
        text: message.subtype === 'success' ? message.result : null,
      };
    }
  }
  await proxy.waitForCalls();

  return {
    apiCalls: proxy.calls.slice(firstCall),
    sdkBlocks,
    thinkingTokenEvents,
    transcriptBlocks: await readTranscriptBlocks(join(home, '.claude')),
    result,
  };
}

function describeBlock(block: any): Block {
  const text: string = block.thinking ?? block.text ?? '';
  const signature: string = block.signature ?? '';
  const data: string = block.data ?? '';

  return {
    type: block.type,
    textBytes: Buffer.byteLength(text, 'utf8'),
    signatureBytes: Buffer.byteLength(signature, 'utf8'),
    dataBytes: Buffer.byteLength(data, 'utf8'),
    text,
  };
}

// the assistant blocks of every transcript the CLI wrote under its config folder
async function readTranscriptBlocks(configDir: string): Promise<Block[]> {
  const files = (await readdir(join(configDir, 'projects'), { recursive: true })).filter((file) =>
    file.endsWith('.jsonl'),
  );
  const blocks: Block[] = [];

  for (const file of files) {
    for (const line of (await readFile(join(configDir, 'projects', file), 'utf8')).split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      const entry = JSON.parse(line);

      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          blocks.push(describeBlock(block));
        }
      }
    }
  }
  return blocks;
}
