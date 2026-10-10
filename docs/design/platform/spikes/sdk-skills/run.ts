// Runs the Agent SDK with nixie's options and planted skills, and reports which skills, commands
// and tools reach the model. Each session uses an empty HOME and a neutral working directory.
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!token) {
  throw new Error('CLAUDE_CODE_OAUTH_TOKEN is not set');
}

const root = mkdtempSync(join(tmpdir(), 'spike-sdk-skills-'));
const home = join(root, 'home');
const cwd = join(root, 'work');
writeSkill(join(home, '.claude', 'skills'), 'planted-home', 'MARKER-HOME');
writeSkill(join(cwd, '.claude', 'skills'), 'planted-project', 'MARKER-PROJECT');

const configs: { name: string; options: Partial<Options> }[] = [
  { name: 'A: tools [], settingSources []', options: {} },
  { name: 'B: tools [], settingSources [], skills []', options: { skills: [] } },
  {
    name: 'C: B plus verbatimPrompts and disableBundledSkills',
    options: { settings: { disableBundledSkills: true }, skills: [], verbatimPrompts: true },
  },
];

for (const config of configs) {
  console.log(`\n=== ${config.name}`);
  const init = await runPrompt(
    config.options,
    'List every tool, skill and slash command you can use, by exact name. Then quote the instructions of the skill named planted-home, if you can see it.',
  );
  console.log(`init skills=${JSON.stringify(init?.skills)}`);
  await runPrompt(config.options, '/planted-home');
  await runPrompt(config.options, '/deep-research');
  await runPrompt(config.options, '/clear');
}

function writeSkill(dir: string, name: string, marker: string): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Planted skill for the spike. Use it whenever asked about skills.\n---\n\nReply with the word ${marker} and nothing else.\n`,
  );
}

async function runPrompt(
  extra: Partial<Options>,
  prompt: string,
): Promise<Extract<SDKMessage, { subtype: 'init' }> | undefined> {
  console.log(`--- prompt ${JSON.stringify(prompt.slice(0, 60))}`);
  let init: Extract<SDKMessage, { subtype: 'init' }> | undefined;
  const transcript: SDKMessage[] = [];
  const session = query({
    prompt,
    options: {
      cwd,
      env: {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_OAUTH_TOKEN: token ?? '',
        HOME: home,
        PATH: process.env.PATH ?? '',
      },
      maxTurns: 2,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      settingSources: [],
      strictMcpConfig: true,
      tools: [],
      ...extra,
    },
  });
  for await (const message of session) {
    transcript.push(message);
    if (message.type === 'system' && message.subtype === 'init') {
      init = message;
      console.log(`init cli=${message.claude_code_version}`);
      console.log(`init tools=${JSON.stringify(message.tools)}`);
      console.log(`init skills=${JSON.stringify(message.skills)}`);
      console.log(`init slash_commands=${JSON.stringify(message.slash_commands)}`);
      console.log(`init plugins=${JSON.stringify(message.plugins)}`);
    } else if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          console.log(`tool_use ${block.name} ${JSON.stringify(block.input).slice(0, 160)}`);
        } else if (block.type === 'text') {
          console.log(`assistant ${JSON.stringify(block.text.slice(0, 400))}`);
        }
      }
    } else if (message.type === 'system') {
      console.log(`system ${message.subtype} ${JSON.stringify(message).slice(0, 200)}`);
    } else if (message.type === 'result') {
      console.log(`result ${message.subtype} turns=${message.num_turns}`);
    }
  }
  const text = JSON.stringify(transcript);
  console.log(
    `markers home=${text.includes('MARKER-HOME')} project=${text.includes('MARKER-PROJECT')}`,
  );
  return init;
}
