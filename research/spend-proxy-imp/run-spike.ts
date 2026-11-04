// Runs the spike against one preview of a nixie pull request on a preview host whose spend cap is
// on (see README.md). It reads the imp's grants and its route, enrols a device, sends a plain turn
// and a turn that starts a task, reads the proxy's count after each, runs the guest probes, and
// reads the broker's audit. It writes each step's output to SPIKE_WORK and changes nothing on the
// host: the preview service owns the imp, its grants and its proxy.
// Usage: bun run-spike.ts, with the variables that results.md#setup lists
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { $ } from 'bun';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { ContractClient, ContractOutputs } from '../../libs/contract/src/index.ts';
// @boundaries-ignore a spike imports the code it measures
import { clientHeaderName } from '../../libs/contract/src/index.ts';
import { match } from 'ts-pattern';
import { isStepEnded } from './is-step-ended.ts';
import { pickTaskFollowUp } from './pick-task-follow-up.ts';

export interface SpikeTarget {
  readonly impCLI: string;
  readonly imp: string;
  readonly composeFile: string;
  readonly spendDir: string;
}

export interface SpikeClient {
  readonly conversation: Pick<ContractClient['conversation'], 'send' | 'read'>;
  readonly tasks: Pick<ContractClient['tasks'], 'list'>;
}

export interface SpikeDeps {
  readonly client: SpikeClient;
  readonly host: (command: string) => Promise<string>;
  readonly readTurnUsage: () => Promise<string>;
  readonly runGuestProbes: () => Promise<{ readonly exitCode: number; readonly output: string }>;
  readonly writeOutput: (file: string, text: string) => Promise<void>;
  readonly sleep: (durationMs: number) => Promise<void>;
  readonly log: (line: string) => void;
}

export async function runSpike(target: SpikeTarget, deps: SpikeDeps): Promise<void> {
  const hostImp = (command: string) => deps.host(`${target.impCLI} ${command}`);
  const writeStep = async (file: string, text: string) => {
    await deps.writeOutput(file, text);
    deps.log(text.trimEnd());
  };
  // a preview whose proxy never started has no count file, and any other read error stops the spike
  const countPath = `${target.spendDir}/${target.imp}.count.json`;
  const writeCount = async (file: string, label: string) => {
    const count = await deps.host(
      `if [ -e ${countPath} ]; then cat ${countPath}; else echo none; fi`,
    );
    await deps.writeOutput(file, count);
    deps.log(`== the count ${label}: ${count.trim()}`);
  };

  deps.log("== the imp's grants, egress policy and model route");
  await writeStep(
    'route.txt',
    [
      await hostImp(`grants ${target.imp}`),
      await hostImp(`policy ${target.imp}`),
      await hostImp(
        `exec ${target.imp} -- docker compose -f ${target.composeFile} exec -T nixie sh -c 'printenv NIXIE_PREVIEW_MODEL_ROUTE; grep base_url /var/lib/nixie-preview/config.yaml'`,
      ),
    ].join(''),
  );
  await writeCount('count-0.json', 'before the turns');

  const plain = await deps.client.conversation.send(
    buildTypedMessage('What is two plus two? Answer in one short sentence.'),
  );
  const plainPage = await waitForStepEnd(deps, 'conversation', plain.sequence, 'the plain turn');
  await deps.writeOutput('plain.jsonl', formatRecords(plainPage, plain.sequence));
  await writeCount('count-1.json', 'after the plain turn');

  const knownIDs = (await deps.client.tasks.list()).tasks.map((task) => task.taskID);
  const taskTurn = await deps.client.conversation.send(
    buildTypedMessage(
      "Start a task named 'tide note' whose brief is: write one sentence on why the sea has tides. Then tell me you started it.",
    ),
  );
  const taskTurnPage = await waitForStepEnd(
    deps,
    'conversation',
    taskTurn.sequence,
    'the task turn',
  );
  await deps.writeOutput('task.jsonl', formatRecords(taskTurnPage, taskTurn.sequence));

  await match(pickTaskFollowUp(knownIDs, (await deps.client.tasks.list()).tasks))
    .with({ kind: 'no-task' }, async () => {
      // a failed model call ends the turn before the conversation can start the task
      deps.log('== the conversation started no task; task.jsonl holds its turn');
    })
    .with({ kind: 'wait-for-task' }, async ({ taskID }) => {
      const taskPage = await waitForStepEnd(deps, taskID, 0, "the task's step");
      await deps.writeOutput('task-thread.jsonl', formatRecords(taskPage, 0));
    })
    .exhaustive();
  await writeCount('count-2.json', "after the task's step");

  deps.log("== nixie's own token counts, from the turn-ended records of each thread");
  await writeStep('turn-usage.jsonl', await deps.readTurnUsage());

  deps.log('== the guest probes');
  const probes = await deps.runGuestProbes();
  await writeStep('probes.tsv', probes.output);
  if (probes.exitCode !== 0) {
    throw new Error(`the guest probes exited ${String(probes.exitCode)}`);
  }
  await writeCount('count-3.json', 'after the probes');

  deps.log("== the broker's audit: requests with a credential, then refusals");
  await writeStep(
    'audit.txt',
    (await hostImp(`audit ${target.imp} --limit 50`)) +
      (await hostImp(`audit ${target.imp} --kind refused --limit 50`)),
  );
}

function buildTypedMessage(text: string) {
  return {
    clientMessageId: crypto.randomUUID(),
    text,
    thread: 'conversation',
    spans: [{ start: 0, end: text.length, source: 'typed' as const }],
  };
}

type ThreadPage = ContractOutputs['conversation']['read'];

// a step's model calls take seconds, and the memory writer retries a failed one at doubling gaps,
// so 5 minutes covers a step that ends at all
async function waitForStepEnd(
  deps: SpikeDeps,
  thread: string,
  afterSequence: number,
  label: string,
): Promise<ThreadPage> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const page = await deps.client.conversation.read({ thread, limit: 200 });

    if (isStepEnded(page, afterSequence)) {
      return page;
    }

    await deps.sleep(5000);
  }

  throw new Error(`${label} did not end in 5 minutes`);
}

function formatRecords(page: ThreadPage, fromSequence: number): string {
  return page.records
    .filter((record) => record.sequence >= fromSequence)
    .map((record) =>
      JSON.stringify({ sequence: record.sequence, kind: record.kind, text: record.message?.text }),
    )
    .map((line) => `${line}\n`)
    .join('');
}

interface SpikeEnv extends SpikeTarget {
  readonly previewSSH: string;
  readonly origin: string;
  readonly routeListener: string;
  readonly work: string;
  readonly token: string | undefined;
}

async function readDeviceToken(
  env: SpikeEnv,
  host: (command: string) => Promise<string>,
  signedOut: ContractClient,
): Promise<string> {
  if (env.token !== undefined) {
    return env.token;
  }

  const logs = await host(
    `${env.impCLI} exec ${env.imp} -- docker compose -f ${env.composeFile} logs --no-log-prefix enrol`,
  );
  const code = logs.split('\n')[0] ?? '';
  const session = await signedOut.sessions
    .enrol({ clientActionID: crypto.randomUUID(), code, deviceName: 'spike', tokenDelivery: 'bearer' })
    .catch((error: unknown) => {
      throw new Error(`the sign-in code ${code} was refused; set SPIKE_TOKEN or get a new code`, {
        cause: error,
      });
    });

  if (session.token === undefined) {
    throw new Error('the enrolment returned no bearer token');
  }

  return session.token;
}

function readEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`set ${name}`);
  }

  return value;
}

if (import.meta.main) {
  const env: SpikeEnv = {
    previewSSH: readEnv('PREVIEW_SSH'),
    impCLI: readEnv('IMP_CLI'),
    imp: readEnv('IMP'),
    origin: readEnv('ORIGIN'),
    composeFile: readEnv('COMPOSE_FILE'),
    spendDir: readEnv('SPEND_DIR'),
    routeListener: readEnv('ROUTE_LISTENER'),
    work: readEnv('SPIKE_WORK'),
    token: process.env['SPIKE_TOKEN'] || undefined,
  };
  await mkdir(env.work, { recursive: true });

  const host = (command: string) => $`ssh ${env.previewSSH} ${command} < /dev/null`.text();
  const signedOut = createORPCClient<ContractClient>(
    new RPCLink({ url: `${env.origin}/rpc`, headers: { [clientHeaderName]: 'spike' } }),
  );
  const token = await readDeviceToken(env, host, signedOut);
  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${env.origin}/rpc`,
      headers: { [clientHeaderName]: 'spike', authorization: `Bearer ${token}` },
    }),
  );

  // the preview's nixie container holds no package for the reader, so it gets one bundled file
  const reader = await Bun.build({
    entrypoints: [join(import.meta.dir, 'read-turn-usage.ts')],
    target: 'bun',
  });
  const [readerFile] = reader.outputs;
  if (!reader.success || readerFile === undefined) {
    throw new AggregateError(reader.logs, 'the turn usage reader did not bundle');
  }
  const inNixie = `${env.impCLI} exec ${env.imp} -- docker compose -f ${env.composeFile} exec -T nixie`;

  await runSpike(env, {
    client,
    host,
    readTurnUsage: () =>
      $`ssh ${env.previewSSH} ${`${inNixie} sh -c 'cat > /tmp/read-turn-usage.js && bun /tmp/read-turn-usage.js'`} < ${new Response(readerFile)}`.text(),
    runGuestProbes: async () => {
      const probes =
        await $`ssh ${env.previewSSH} ${`${env.impCLI} exec ${env.imp} -- sh -s ${env.imp} ${env.routeListener}`} < ${Bun.file(join(import.meta.dir, 'guest-probes.sh'))}`
          .quiet()
          .nothrow();

      return { exitCode: probes.exitCode, output: probes.stdout.toString() };
    },
    writeOutput: async (file, text) => {
      await Bun.write(join(env.work, file), text);
    },
    sleep: (durationMs) => Bun.sleep(durationMs),
    log: (line) => {
      console.log(line);
    },
  });
}
