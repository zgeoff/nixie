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
import { findNewTaskID } from './find-new-task-id.ts';
import { isStepEnded } from './is-step-ended.ts';

interface SpikeConfig {
  readonly previewSSH: string;
  readonly impCLI: string;
  readonly imp: string;
  readonly origin: string;
  readonly composeFile: string;
  readonly spendDir: string;
  readonly routeListener: string;
  readonly work: string;
  readonly token: string | undefined;
}

export async function runSpike(config: SpikeConfig): Promise<void> {
  await mkdir(config.work, { recursive: true });

  const host = (command: string) => $`ssh ${config.previewSSH} ${command} < /dev/null`.text();
  const hostImp = (command: string) => host(`${config.impCLI} ${command}`);
  const inNixie = `exec ${config.imp} -- docker compose -f ${config.composeFile}`;
  const writeStep = async (file: string, text: string) => {
    await Bun.write(join(config.work, file), text);
    console.log(text.trimEnd());
  };
  // a preview whose proxy never started has no count file, and any other read error stops the spike
  const countPath = `${config.spendDir}/${config.imp}.count.json`;
  const writeCount = async (file: string, label: string) => {
    const count = await host(`if [ -e ${countPath} ]; then cat ${countPath}; else echo none; fi`);
    await Bun.write(join(config.work, file), count);
    console.log(`== the count ${label}: ${count.trim()}`);
  };

  console.log("== the imp's grants, egress policy and model route");
  await writeStep(
    'route.txt',
    [
      await hostImp(`grants ${config.imp}`),
      await hostImp(`policy ${config.imp}`),
      await hostImp(
        `${inNixie} exec -T nixie sh -c 'printenv NIXIE_PREVIEW_MODEL_ROUTE; grep base_url /var/lib/nixie-preview/config.yaml'`,
      ),
    ].join(''),
  );
  await writeCount('count-0.json', 'before the turns');

  const token = config.token ?? (await createDeviceToken(config, hostImp));
  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${config.origin}/rpc`,
      headers: { [clientHeaderName]: 'spike', authorization: `Bearer ${token}` },
    }),
  );

  const plain = await client.conversation.send(
    buildTypedMessage('What is two plus two? Answer in one short sentence.'),
  );
  const plainPage = await waitForStepEnd(client, 'conversation', plain.sequence, 'the plain turn');
  await Bun.write(join(config.work, 'plain.jsonl'), formatRecords(plainPage, plain.sequence));
  await writeCount('count-1.json', 'after the plain turn');

  // the task this turn starts is the one task that was not there before it, so a task an earlier
  // spike started never stands in for it
  const knownIDs = (await client.tasks.list()).tasks.map((task) => task.taskID);
  const taskTurn = await client.conversation.send(
    buildTypedMessage(
      "Start a task named 'tide note' whose brief is: write one sentence on why the sea has tides. Then tell me you started it.",
    ),
  );
  const taskTurnPage = await waitForStepEnd(
    client,
    'conversation',
    taskTurn.sequence,
    'the task turn',
  );
  await Bun.write(join(config.work, 'task.jsonl'), formatRecords(taskTurnPage, taskTurn.sequence));

  const taskID = findNewTaskID(knownIDs, (await client.tasks.list()).tasks);
  if (taskID === undefined) {
    // a failed model call ends the turn before the conversation can start the task
    console.log(`== the conversation started no task; ${config.work}/task.jsonl holds its turn`);
  } else {
    const taskPage = await waitForStepEnd(client, taskID, 0, "the task's step");
    await Bun.write(join(config.work, 'task-thread.jsonl'), formatRecords(taskPage, 0));
  }
  await writeCount('count-2.json', "after the task's step");

  console.log("== nixie's own token counts, from the turn-ended records of each thread");
  const reader = await Bun.build({
    entrypoints: [join(import.meta.dir, 'read-turn-usage.ts')],
    target: 'bun',
  });
  const [readerFile] = reader.outputs;
  if (!reader.success || readerFile === undefined) {
    throw new AggregateError(reader.logs, 'the turn usage reader did not bundle');
  }
  await writeStep(
    'turn-usage.jsonl',
    await $`ssh ${config.previewSSH} ${`${config.impCLI} ${inNixie} exec -T nixie sh -c 'cat > /tmp/read-turn-usage.js && bun /tmp/read-turn-usage.js'`} < ${new Response(readerFile)}`.text(),
  );

  console.log('== the guest probes');
  const probes =
    await $`ssh ${config.previewSSH} ${`${config.impCLI} exec ${config.imp} -- sh -s ${config.imp} ${config.routeListener}`} < ${Bun.file(join(import.meta.dir, 'guest-probes.sh'))}`
      .quiet()
      .nothrow();
  await writeStep('probes.tsv', probes.stdout.toString());
  if (probes.exitCode !== 0) {
    throw new Error(`the guest probes exited ${String(probes.exitCode)}: ${probes.stderr.toString()}`);
  }
  await writeCount('count-3.json', 'after the probes');

  console.log("== the broker's audit: requests with a credential, then refusals");
  await writeStep(
    'audit.txt',
    (await hostImp(`audit ${config.imp} --limit 50`)) +
      (await hostImp(`audit ${config.imp} --kind refused --limit 50`)),
  );
}

async function createDeviceToken(
  config: SpikeConfig,
  hostImp: (command: string) => Promise<string>,
): Promise<string> {
  const logs = await hostImp(
    `exec ${config.imp} -- docker compose -f ${config.composeFile} logs --no-log-prefix enrol`,
  );
  const code = logs.split('\n')[0] ?? '';
  const signedOut = createORPCClient<ContractClient>(
    new RPCLink({ url: `${config.origin}/rpc`, headers: { [clientHeaderName]: 'spike' } }),
  );
  const session = await signedOut.sessions
    .enrol({
      clientActionID: crypto.randomUUID(),
      code,
      deviceName: 'spike',
      tokenDelivery: 'bearer',
    })
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
  client: ContractClient,
  thread: string,
  afterSequence: number,
  label: string,
): Promise<ThreadPage> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const page = await client.conversation.read({ thread, limit: 200 });

    if (isStepEnded(page, afterSequence)) {
      return page;
    }

    await Bun.sleep(5000);
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

function readEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`set ${name}`);
  }

  return value;
}

if (import.meta.main) {
  await runSpike({
    previewSSH: readEnv('PREVIEW_SSH'),
    impCLI: readEnv('IMP_CLI'),
    imp: readEnv('IMP'),
    origin: readEnv('ORIGIN'),
    composeFile: readEnv('COMPOSE_FILE'),
    spendDir: readEnv('SPEND_DIR'),
    routeListener: readEnv('ROUTE_LISTENER'),
    work: readEnv('SPIKE_WORK'),
    token: process.env['SPIKE_TOKEN'] || undefined,
  });
}
