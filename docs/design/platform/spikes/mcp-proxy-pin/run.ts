// oxlint-disable no-await-in-loop, max-statements, one-var, zgeoff/no-await-args -- each case runs alone, in printed order
// Drives the proxy through each change to the stand-in server and prints every decision.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutsideServerProxy } from './proxy.ts';
import type { Declaration, ProxyOptions, ToolDecision, Trust } from './proxy.ts';

const declarations: Record<string, Declaration> = {
  get_forecast: { destinations: [], effects: ['fetch'] },
  lookup_note: { destinations: [], effects: ['read'] },
  send_message: { destinations: ['to'], effects: ['send'] },
};

const mutations = ['description', 'input-schema', 'add-tool', 'remove-tool', 'annotations'];
const approvedAfter: Record<string, string> = {
  description: 'get_forecast',
  'input-schema': 'send_message',
};

const work = mkdtempSync(join(tmpdir(), 'mcp-proxy-pin-'));
const baselinePins = join(work, 'baseline.json');

function printDecisions(decisions: ToolDecision[]): void {
  for (const decision of decisions) {
    const parts = [decision.status.padEnd(8), decision.tool.padEnd(13)];
    if (decision.exposedAs) {
      parts.push(`as ${decision.exposedAs}`);
    }
    if (decision.why) {
      parts.push(`(${decision.why})`);
    }
    if (decision.notice) {
      parts.push(`notice: ${decision.notice}`);
    }
    console.log(`  ${parts.join(' ')}`);
  }
}

function printOutcome(outcome: unknown): void {
  console.log(`  ${JSON.stringify(outcome)}`);
}

function createProxy(overrides: Partial<ProxyOptions> & { pinsPath: string }): OutsideServerProxy {
  return new OutsideServerProxy({
    clientValidates: false,
    declarations,
    env: {},
    serverId: 'standin',
    trust: 'untrusted',
    ...overrides,
  });
}

async function setupBaseline(): Promise<void> {
  const proxy = createProxy({ pinsPath: baselinePins });
  const version = await proxy.start();
  console.log(`== negotiated protocol version: ${version}`);
  console.log('== baseline, before the owner reviews the server');
  printDecisions(await proxy.checkTools());
  for (const name of Object.keys(declarations)) {
    proxy.writePin(name);
  }
  console.log('== baseline, after the owner pins each tool');
  printDecisions(await proxy.checkTools());
  await proxy.stop();
}

async function checkLegacyServer(): Promise<void> {
  const proxy = createProxy({
    pinsPath: join(work, 'v1.json'),
    script: 'server-v1.ts',
    serverId: 'oldie',
  });
  const version = await proxy.start();
  console.log(`== a v1 SDK server, client in auto mode: negotiated ${version}`);
  await proxy.checkTools();
  proxy.writePin('lookup_note');
  printDecisions(await proxy.checkTools());
  printOutcome(await proxy.runTool('oldie__lookup_note', { id: 'n1' }));
  await proxy.stop();
}

async function runMutation(mutation: string, trust: Trust): Promise<void> {
  const pinsPath = join(work, `${trust}-${mutation}.json`);
  copyFileSync(baselinePins, pinsPath);
  const proxy = createProxy({ env: { MUTATION: mutation }, pinsPath, trust });
  await proxy.start();
  console.log(`== ${mutation}, ${trust} server`);
  printDecisions(await proxy.checkTools());
  const approved = approvedAfter[mutation];
  if (trust === 'untrusted' && approved) {
    proxy.writePin(approved);
    console.log(`== ${mutation}, untrusted server, after the owner approves the change`);
    printDecisions(await proxy.checkTools());
  }
  await proxy.stop();
}

async function runCalls(): Promise<void> {
  const pinsPath = join(work, 'calls.json');
  copyFileSync(baselinePins, pinsPath);

  const good = createProxy({ pinsPath });
  await good.start();
  await good.checkTools();
  console.log('== call standin__get_forecast, conforming result');
  printOutcome(await good.runTool('standin__get_forecast', { city: 'Oslo' }));
  console.log('== call standin__delete_all, never exposed');
  printOutcome(await good.runTool('standin__delete_all', {}));
  await good.stop();

  const proxied = createProxy({ env: { MUTATION: 'bad-output' }, pinsPath });
  await proxied.start();
  await proxied.checkTools();
  console.log('== bad structuredContent, the proxy validates against its pin');
  printOutcome(await proxied.runTool('standin__get_forecast', { city: 'Oslo' }));
  await proxied.stop();

  const clientSide = createProxy({
    clientValidates: true,
    env: { MUTATION: 'bad-output' },
    pinsPath,
  });
  await clientSide.start();
  await clientSide.checkTools();
  console.log('== bad structuredContent, the v2 client with its default validator');
  try {
    const outcome = await clientSide.runTool('standin__get_forecast', { city: 'Oslo' });
    printOutcome(outcome);
  } catch (error) {
    console.log(`  client threw: ${String(error)}`);
  }
  await clientSide.stop();
}

try {
  await setupBaseline();
  await checkLegacyServer();
  for (const trust of ['untrusted', 'trusted'] as const) {
    for (const mutation of mutations) {
      await runMutation(mutation, trust);
    }
  }
  await runCalls();
} finally {
  rmSync(work, { force: true, recursive: true });
}
