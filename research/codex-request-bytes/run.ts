// Runs one nixie Codex turn through the production guest against a stub model API, and writes
// every request the CLI sent to runs/<run_name>/<variant>.json.
//
//   CODEX_BIN_DIR=<dir with codex 0.166.0> bun run.ts <run_name> <variant>... (or all)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeFrame,
  encodeHostFrame,
  guestFrameSchema,
  hostFrameLimitBytes,
  makeFrameDecoder,
} from '@heynixie/wire';
// @boundaries-ignore a spike imports the code it measures
import { runCodexGuest } from '../../guests/codex/src/index';
// @boundaries-ignore a spike imports the code it measures
import { startCodexProcess } from '../../guests/codex/src/turn/start-codex-process';
// @boundaries-ignore a spike imports the code it measures
import { renderPrompt } from '../../modules/prompts/src/prompt/render-prompt';
// the prompts module's record kinds, which its own index brings in and a path import skips
// @boundaries-ignore a spike imports the code it measures
import type {} from '../../modules/prompts/src/prompt/prompts-record-kind';
import { buildTaskTools } from './build-task-tools';
import { startRefusingProxy } from './start-refusing-proxy';
import { startStubUpstream } from './start-stub-upstream';
import { startToolServer } from './start-tool-server';
import type { Variant } from './variants';
import { collectVariantNames, getVariant, readCatalog } from './variants';

const [runName, ...variantNames] = Bun.argv.slice(2);
const codexBinDir = process.env['CODEX_BIN_DIR'];

if (runName === undefined || variantNames.length === 0 || codexBinDir === undefined) {
  throw new Error('usage: CODEX_BIN_DIR=<dir> bun run.ts <run_name> <variant>...');
}

const spikeDir = import.meta.dir;
const prompt = 'Check the time and report it in one line.';

const systemPrompt = renderPrompt(
  'task',
  {
    persona: '',
    owner: { name: 'Sam' },
    task: {
      name: 'clock-check',
      brief: 'Report the current time.',
      reportTargetSentence: ' Your report goes to the conversation.',
    },
  },
  {},
);

const version = (await Bun.$`${join(codexBinDir, 'codex')} --version`.text()).trim();

if (version !== 'codex-cli 0.166.0') {
  throw new Error(`the spike pins codex-cli 0.166.0; ${codexBinDir} holds ${version}`);
}

for (const name of variantNames[0] === 'all' ? collectVariantNames() : variantNames) {
  const record = await runVariant(getVariant(name));
  const out = join(spikeDir, 'runs', runName, `${name}.json`);

  mkdirSync(join(spikeDir, 'runs', runName), { recursive: true });
  await writeFile(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${name}: ${record.outcome}, ${record.requests.length} requests`);
}

async function runVariant(variant: Variant) {
  const stub = startStubUpstream(variant.stub);
  const tools = startToolServer(buildTaskTools());
  const proxy = await startRefusingProxy();
  const home = join(spikeDir, '.state', variant.name);

  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });

  const frame: HostFrame = {
    type: 'turn',
    profile: {
      harness: 'codex',
      model: 'gpt-6-luna',
      baseURL: `${stub.url}/v1${variant.baseURLTail ?? ''}`,
      effort: 'low',
      chatgptLogin: variant.isPlanLogin ? { accountID: 'acct-spike', planType: 'pro' } : null,
    },
    tools: { url: tools.url, token: 'step-token' },
    systemPrompt,
    input: [{ uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', text: prompt }],
    limits: { modelCalls: null, toolCallWaitMs: null },
  };
  const frames: GuestFrame[] = [];
  const decode = makeFrameDecoder(hostFrameLimitBytes);
  const files: { config: string; catalog: string } = { config: '', catalog: '' };

  try {
    await runCodexGuest({
      input: [encodeFrame(encodeHostFrame(new Set(), frame))],
      write: (bytes) => {
        for (const message of decode(bytes)) {
          frames.push(decodeTurnFrame(guestFrameSchema, message));
        }

        return Promise.resolve();
      },
      env: {
        PATH: `${codexBinDir}:${process.env['PATH'] ?? ''}`,
        HOME: home,
        OPENAI_API_KEY: 'nixie-broker-placeholder',
        HTTPS_PROXY: proxy.url,
        HTTP_PROXY: proxy.url,
        NO_PROXY: '127.0.0.1',
      },
      startProcess: (env, cwd) => {
        // the guest has written its config and catalog by now; the variant changes them before
        // the CLI reads them
        Object.assign(files, writeVariantFiles(join(home, '.codex'), variant, stub.url));

        return startCodexProcess(env, cwd);
      },
    });
  } finally {
    await tools.stop();
    await stub.stop();
    await proxy.stop();
  }

  const ended = frames.find((guestFrame) => guestFrame.type === 'ended' || guestFrame.type === 'failed');

  return {
    variant: variant.name,
    description: variant.description,
    systemPrompt,
    prompt,
    outcome: ended === undefined ? 'no end frame' : JSON.stringify(ended).slice(0, 300),
    config: files.config.replaceAll(home, '<home>').replaceAll(stub.url, '<stub>'),
    catalog: JSON.parse(files.catalog.replaceAll(home, '<home>')) as unknown,
    proxyAttempts: proxy.attempts,
    requests: stub.requests.map((request) => ({
      ...request,
      headers: redactHeaders(request.headers, home),
      body: request.body.replaceAll(home, '<home>'),
    })),
  };
}

// The user agent names the host's operating system, which a committed run leaves out.
function redactHeaders(headers: Readonly<Record<string, string>>, home: string): unknown {
  const named = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      name === 'user-agent' ? value.replace(/\([^)]*\)/u, '(<os>)') : value,
    ]),
  );

  return JSON.parse(JSON.stringify(named).replaceAll(home, '<home>')) as unknown;
}

function writeVariantFiles(
  codexHome: string,
  variant: Variant,
  stubURL: string,
): { config: string; catalog: string } {
  const configPath = join(codexHome, 'config.toml');
  const catalogPath = join(codexHome, 'model-catalog.json');
  const config = variant.changeConfig(readFileSync(configPath, 'utf8'), stubURL);
  const catalog = JSON.stringify(variant.changeCatalog(readCatalog(catalogPath)));

  writeFileSync(configPath, config);
  writeFileSync(catalogPath, catalog);

  return { config, catalog };
}
