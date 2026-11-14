import { join } from 'node:path';
import { browser } from '@wringer/browser';
import { WringerError, createWringer, local } from '@wringer/core';
import type { Wringer } from '@wringer/core';
import { db } from '@wringer/db';
import { http } from '@wringer/http';
import type { HttpClient } from '@wringer/http';
import { stream } from '@wringer/stream';
import { terminal } from '@wringer/terminal';
import { $ } from 'bun';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildHostCLIArgv } from './build-host-cli-argv';
import { conversationRecordSchema } from './collect-conversation-records';
import { featurePaths, ignoredPaths, sharedPaths } from './feature-paths';
import { controlRoutes } from './harness/control-routes';
import type { ControlRoute } from './harness/control-routes';
import { parseEnrolmentCode } from './parse-enrolment-code';
import { buildServedBlobsArgv, servedSourceFolders } from './preview/build-served-blobs-argv';
import { createPreviewHost } from './preview/create-preview-host';
import { pickCommitRefusal } from './preview/pick-commit-refusal';
import { pickSourceRefusal } from './preview/pick-source-refusal';
import { previewCheckout } from './preview/preview-checkout';
import { readPreviewEndpoints } from './preview/read-preview-endpoints';
import type { PullRequest } from './preview/read-pull-request';
import { readPullRequest } from './preview/read-pull-request';
import { readConversationTurn } from './read-conversation-turn';
import { runHostCLI } from './run-host-cli';

const sessionsSchema = z.array(
  z.object({ deviceName: z.string(), createdAt: z.string(), lastUsedAt: z.string() }),
);

const conversationTurnSchema = z.strictObject({ records: z.array(conversationRecordSchema) });
const harnessPath = join(import.meta.dir, 'harness', 'run-verify-harness.ts');

const refusalHint =
  'This target refuses the command. Leave it undone, skip `done` for this feature, and report the command you needed: add the triage label to the pull request, or report it to the owner.';

// The registry's name is not `nixie`: gunshi reads a command group named like the program as the
// program itself.
export function createVerifyRegistry(): Wringer {
  const pullRequest = makeCachedRead(readPullRequest);
  const previewHost = createPreviewHost(process.env, pullRequest);

  return createWringer({ name: 'nixie-verify' })
    .use(browser({}))
    .use(http({}))
    .use(stream({}))
    .use(terminal({ cols: 120, rows: 30 }))
    .use(db({}))
    .target('local', {
      mode: 'launch',
      access: 'read-write',
      refusalHint,
      host: local(),
      launch: () => ({
        command: [process.execPath, '--define', 'NIXIE_TEST_BUILD=true', harnessPath],
        ready: (line) =>
          line['event'] === 'ready'
            ? {
                web: String(line['web']),
                control: String(line['control']),
                config: String(line['config']),
                cli: String(line['cli']),
                db: String(line['db']),
              }
            : null,
      }),
      drivers: {
        browser: () => ({}),

        // the harness's control routes, which script the model and report nixie's state
        http: () => ({ endpoint: 'control', healthPath: controlRoutes.health.path }),
        terminal: (ctx) => ({
          programs: {
            'enrol-code': {
              command: [...buildHostCLIArgv('local', ctx.endpoints, ['enrol-code'])],
            },
          },
        }),
        db: (ctx) => ({ via: 'sql', adapter: 'sqlite', url: String(ctx.endpoints['db']) }),
        stream: () => ({}),
      },
    })
    .target('preview', {
      mode: 'attach',
      access: 'read-write',
      refusalHint,
      host: previewHost,
      endpoints: () => readPreviewEndpoints(pullRequest),
      revision: () => readServedCommit(previewHost),
      drivers: {
        browser: () => ({}),
        http: () => ({ healthPath: '/health/ready' }),
      },
    })
    .secret('NIXIE_PREVIEW_SSH', 'NIXIE_PREVIEW_IMP_EXEC')
    .action({
      name: 'enrol-code',
      summary:
        'Issue a sign-in code with `nixie enrol-code`, for the enrol form on the sign-in page',
      effect: 'write',
      input: z.strictObject({}),
      data: z.strictObject({ code: z.string() }),
      run: async (_input, ctx) => {
        const printed = await runHostCLI(ctx, ['enrol-code']);

        const code = parseEnrolmentCode(printed);

        if (code === null) {
          throw new WringerError('check-failed', { message: 'nixie enrol-code printed no code' });
        }

        return { code };
      },
    })
    .action({
      name: 'script-reply',
      summary:
        "Queue the scripted model's next reply; with --memory, the model first proposes that memory with its memory tool",
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.addReply.input,
      data: controlRoutes.addReply.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.addReply, input),
    })
    .action({
      name: 'reset-data',
      summary:
        "Reset the preview's data with `nixie reset --keep-sessions`, which keeps each signed-in browser",
      effect: 'write',
      targets: ['preview'],
      input: z.strictObject({}),
      data: z.strictObject({ printed: z.string() }),
      timeoutMs: 120_000,
      run: async (_input, ctx) => {
        const printed = await runHostCLI(ctx, ['reset', '--keep-sessions', '--yes']);

        return { printed };
      },
    })
    .command({
      path: ['sessions'],
      summary: 'Check with `nixie sessions` that a signed-in session has the device name --device',
      effect: 'read',
      args: z.strictObject({ device: z.string().min(1) }),
      data: z.strictObject({ sessions: sessionsSchema }),
      run: async (args, ctx) => {
        const printed = await runHostCLI(ctx, ['sessions']);

        const sessions = sessionsSchema.parse(JSON.parse(printed));

        if (!sessions.some((session) => session.deviceName === args.device)) {
          throw new WringerError('check-failed', {
            message: `no session has the device name ${args.device}`,
            data: { sessions },
          });
        }

        return { sessions };
      },
    })
    .command({
      path: ['conversation', 'turn'],
      summary:
        'Check that the records since `use` hold the owner message --message, then the reply --reply',
      effect: 'read',
      args: z.strictObject({ message: z.string().min(1), reply: z.string().min(1) }),
      data: conversationTurnSchema,
      run: (args, ctx) => readConversationTurn(ctx.drivers.stream, args),
    })
    .check({
      name: 'nixie',
      input: z.strictObject({}),
      data: z.strictObject({ commit: z.string() }),

      // the preview's container hashes each source file it holds
      timeoutMs: 60_000,
      run: (_input, ctx) =>
        match(ctx.target)
          .with('preview', () => checkPreviewCommit(previewHost))
          .otherwise(() => checkHarness(ctx.drivers.http)),
    })
    .feature(
      {
        name: 'sign-in-enrol',
        summary: 'Sign a browser in with a code from `nixie enrol-code`, and see its session',
        paths: featurePaths['sign-in-enrol'],
      },
      {
        name: 'chat-turn',
        summary: 'Send a message from the page, and see the reply after it, in order',
        paths: featurePaths['chat-turn'],
      },
      {
        name: 'memory-approval',
        summary: 'Approve a memory the model proposed, and see it become active',
        paths: featurePaths['memory-approval'],
      },
    )
    .shared(...sharedPaths)
    .ignore(...ignoredPaths)
    .build();
}

// The pull request is read once per command, for the preview's host, endpoints and revision.
function makeCachedRead(read: () => Promise<PullRequest>): () => Promise<PullRequest> {
  const cached: { read: Promise<PullRequest> | null } = { read: null };

  return () => {
    cached.read ??= read();

    return cached.read;
  };
}

const servedCommitArgv = ['git', '-C', previewCheckout, 'rev-parse', 'HEAD'];

type PreviewHost = ReturnType<typeof createPreviewHost>;

async function readServedCommit(host: PreviewHost): Promise<string> {
  const ran = await host.run({ argv: servedCommitArgv, access: 'read-only' });

  if (ran.exitCode !== 0) {
    throw new Error(`the preview's checkout has no commit: ${ran.stderr.trim()}`);
  }

  return ran.stdout.trim();
}

async function postControl<Input extends z.ZodType, Output extends z.ZodType>(
  client: HttpClient,
  route: ControlRoute<Input, Output>,
  input: z.input<Input>,
): Promise<z.output<Output>> {
  const request =
    route.method === 'GET'
      ? ({ method: 'GET', path: route.path } as const)
      : ({ method: 'POST', path: route.path, json: input } as const);

  const response = await client.request(request);

  return route.output.parse(response.json);
}

const previewRefusalHint =
  'Push this commit, open the preview link on the pull request to rebuild the preview, then run `bun verify attach` and `bun verify doctor` again.';

// The checkout can move on while a container from an older build still serves, so the doctor also
// compares the container's files with this tree. A doctor check's exec refuses every raw command,
// so the check runs its reads on the preview's host itself.
async function checkPreviewCommit(host: PreviewHost): Promise<{ commit: string }> {
  const served = await host.run({ argv: servedCommitArgv, access: 'read-only' });
  const head = await $`git rev-parse HEAD`.quiet().text();

  const commitRefusal = pickCommitRefusal(served.stdout, head);

  if (commitRefusal !== null) {
    throw new WringerError('check-failed', { message: commitRefusal, hint: previewRefusalHint });
  }

  const servedBlobs = await host.run({ argv: buildServedBlobsArgv(), access: 'read-only' });

  if (servedBlobs.exitCode !== 0) {
    throw new WringerError('environment', {
      message: `the preview's nixie container could not list its files: ${servedBlobs.stderr.trim()}`,
      hint: 'Open the preview link on the pull request, wait for the preview to serve, then run `bun verify doctor` again.',
    });
  }

  const committed = await $`git ls-tree -r HEAD -- ${servedSourceFolders}`.quiet().text();

  const sourceRefusal = pickSourceRefusal(committed, servedBlobs.stdout);

  if (sourceRefusal !== null) {
    throw new WringerError('check-failed', { message: sourceRefusal, hint: previewRefusalHint });
  }

  return { commit: served.stdout.trim() };
}

async function checkHarness(client: HttpClient): Promise<{ commit: string }> {
  const health = await postControl(client, controlRoutes.health, {});

  if (!health.isNixieRunning) {
    throw new WringerError('check-failed', {
      message: 'nixie exited inside the harness',
      hint: 'Run `bun verify up --restart`, then `bun verify doctor`.',
    });
  }

  return { commit: 'worktree' };
}
