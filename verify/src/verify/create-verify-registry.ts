import { join } from 'node:path';
import { browser } from '@wringer/browser';
import { createHostUploader, createWringer, local } from '@wringer/core';
import type { Wringer } from '@wringer/core';
import { db } from '@wringer/db';
import { http } from '@wringer/http';
import { stream } from '@wringer/stream';
import { terminal } from '@wringer/terminal';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildHostCLIArgv } from './build-host-cli-argv';
import { callFeatures, callStepSummary } from './call-features';
import { checkHarness } from './check-harness';
import { conversationRecordSchema } from './collect-conversation-records';
import { computerFeatures } from './computer-features';
import { featurePaths, ignoredPaths, sharedPaths } from './feature-paths';
import { gmailSentCommand } from './gmail-sent-command';
import { controlRoutes } from './harness/control-routes';
import { lastFeatures } from './last-features';
import { liveOpensCommand } from './live-opens-command';
import { pickTaskRefusal } from './pick-task-refusal';
import { postControl } from './post-control';
import { checkPreviewCommit } from './preview/check-preview-commit';
import { createPreviewHost } from './preview/create-preview-host';
import { makeCachedRead } from './preview/make-cached-read';
import { readPreviewEndpoints } from './preview/read-preview-endpoints';
import { readPullRequest } from './preview/read-pull-request';
import { readServedCommit } from './preview/read-served-commit';
import { buildProdEndpoints } from './prod/build-prod-endpoints';
import { readProdCall } from './prod/read-prod-call';
import { readProdErrors } from './prod/read-prod-errors';
import { readProdHealth } from './prod/read-prod-health';
import { readProdVersion } from './prod/read-prod-version';
import { readConversationTurn } from './read-conversation-turn';
import { readHarnessReady } from './read-harness-ready';
import { readModelReceived } from './read-model-received';
import { readSessionCheck } from './read-session-check';
import { refuseHarnessless } from './refuse-harnessless';
import { refuseOffProd } from './refuse-off-prod';
import { runEnrolCode } from './run-enrol-code';
import { runHostCLI } from './run-host-cli';
import { runPauseFromHost } from './run-pause-from-host';
import { sessionsSchema } from './sessions-schema';
import { throwRefusal } from './throw-refusal';
import { waitForModelInput } from './wait-for-model-input';
import { waitForProposals } from './wait-for-proposals';

const conversationTurnSchema = z.strictObject({ records: z.array(conversationRecordSchema) });
const harnessPath = join(import.meta.dir, 'harness', 'run-verify-harness.ts');

// The prod reads leave out each record's and each task's content, which is the owner's data.
const taskListSchema = z.object({ tasks: z.array(z.unknown()) });
const prodReadPaths = ['/rpc/conversation/read', '/rpc/tasks/list'] as const;

const refusalHint =
  'This target refuses the command. Leave it undone, skip `done` for this feature, and report the command you needed: add the triage label to the pull request, or report it to the owner.';

// The registry's name is not `nixie`: gunshi reads a command group named like the program as the
// program itself.
export function createVerifyRegistry(): Wringer {
  const env = process.env;
  const pullRequest = makeCachedRead(readPullRequest);
  const previewHost = createPreviewHost(env, pullRequest);

  return createWringer({ name: 'nixie-verify' })
    .use(browser({}))
    .use(http({}))
    .use(stream({}))
    .use(terminal({ cols: 120, rows: 30 }))
    .use(db({}))
    .target('local', {
      evidence: 'upload',
      mode: 'launch',
      access: 'read-write',
      refusalHint,
      host: local(),
      launch: () => ({
        command: [process.execPath, '--define', 'NIXIE_TEST_BUILD=true', harnessPath],
        ready: readHarnessReady,
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
            'enrol-device-code': {
              command: [...buildHostCLIArgv('local', ctx.endpoints, ['enrol-code', 'device'])],
            },
          },
        }),
        db: (ctx) => ({ via: 'sql', adapter: 'sqlite', url: String(ctx.endpoints['db']) }),
        stream: () => ({}),
      },
    })
    .target('preview', {
      evidence: 'upload',
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
    .target('prod', {
      mode: 'attach',
      access: 'read-only',
      refusalHint,
      host: local(),
      endpoints: () => buildProdEndpoints(env),

      // With no web origin, as in the deploy job, the target runs the doctor's cluster checks alone.
      drivers:
        buildProdEndpoints(env)['web'] === undefined
          ? {}
          : {
              http: () => ({
                healthPath: '/health/ready',
                readOnly: { allow: prodReadPaths.map((path) => ({ method: 'POST', path })) },
              }),
            },
    })
    .hook(
      'upload',
      createHostUploader({ urlEnv: 'CLOUD_FILES_URL', tokenEnv: 'CLOUD_FILES_TOKEN' }),
    )
    .secret('NIXIE_PREVIEW_SSH', 'NIXIE_PREVIEW_IMP_EXEC')
    .secret('NIXIE_PROD_TOKEN', 'NIXIE_PROD_KUBECONFIG')
    .action({
      name: 'enrol-code',
      summary: 'Issue a sign-in code with `nixie enrol-code`, for the enrol form',
      effect: 'write',
      input: z.strictObject({}),
      data: z.strictObject({ code: z.string() }),
      run: (_input, ctx) => runEnrolCode(ctx),
    })
    .action({
      name: 'pause-from-host',
      summary: 'Pause nixie with `nixie pause`, or resume it with `nixie resume`',
      effect: 'write',
      input: z.strictObject({ state: z.enum(['paused', 'running']) }),
      data: z.strictObject({}),
      run: (input, ctx) => runPauseFromHost(ctx, input.state),
    })
    .action({
      name: 'script-reply',
      summary:
        "Queue the scripted model's next reply. With --memory it first proposes that memory, with --reminder it first sets that reminder and writes a note of the memory that the result names as related, with --export it first asks to export memory, with --task it first starts that task, with --coding-task it first starts that coding task on atc, with --mail-watch it first sets a wake rule on the assistant's mailbox for mail from that address, with --mail-read it first lists the unread mail from that address and opens the newest, with --gmail-reply it first searches the connected Google account's mail, opens the first mail and replies to it, with --handover it first asks the user to take over the computer, for that reason, with --notebook it first writes 2 notes, one private, and links them, and with --forget-note it first forgets the note with that short ID, and with --output-tokens the closing reply reports that many output tokens, which a spending gateway prices",
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.addReply.input,
      data: controlRoutes.addReply.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.addReply, input),
    })
    .action({
      name: 'deliver-mail',
      summary:
        "Deliver a mail to the assistant's own mailbox, which a start with NIXIE_VERIFY_MAIL=1 gives it, on a host in memory: from --from, with the subject --subject, the text --text, and an HTML body --html in place of the text",
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.deliverMail.input,
      data: controlRoutes.deliverMail.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.deliverMail, input),
    })
    .action({
      name: 'show-on-device',
      summary:
        'Send the owner message with a photo, and queue the scripted model turn that keeps the photo and shows it on the first device it lists, with the fit --fit and the closing reply --text',
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.showOnDevice.input,
      data: controlRoutes.showOnDevice.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.showOnDevice, input),
    })
    .action({
      name: 'layout-on-device',
      summary:
        'Send an owner message, and queue the scripted model turn that works on the first device it lists: --step set lays its screen out in 3 regions and fills them, the first for 1 minute, and --step update replaces the text of the second region, --step save saves the layout as evening, --step change lays the screen out again in 2 regions, the second on a teal background, --step restore restores evening, --step preview previews its screen, and --step install asks for the package ripple-count 1.0.0, --step approve-install approves that held call as the owner would and returns once the package is stored, --step package fills the second region with a page that loads it and reads the declared fetch of https://tides.test/today, and --step approve approves the held device.region call as the owner would. --text is the closing reply',
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.layoutOnDevice.input,
      data: controlRoutes.layoutOnDevice.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.layoutOnDevice, input),
    })
    .action({
      name: 'approve-held-mcp',
      summary:
        'Approve the pending MCP cards that carry the label --label, Add the server or Allow the tool, as the owner would, which a journey browser cannot because the answer takes a passkey. Needs a start with NIXIE_VERIFY_MCP=1',
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.approveHeldMcp.input,
      data: controlRoutes.approveHeldMcp.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.approveHeldMcp, input),
    })
    .action({
      name: 'probe-route',
      summary:
        "Send one model request to the spending gateway's route --route, and read its answer: a route at its limit answers 403 with the error limit_reached, which names the route. Needs a start with NIXIE_VERIFY_SPEND=1",
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.probeRoute.input,
      data: controlRoutes.probeRoute.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.probeRoute, input),
    })
    .action({
      name: 'advance-clock',
      summary:
        "Move nixie's clock forward by --minutes, so content that lasts minutes ends with no wait",
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.advanceClock.input,
      data: controlRoutes.advanceClock.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.advanceClock, input),
    })
    .action({
      name: 'call-step',
      summary: callStepSummary,
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.callStep.input,
      data: controlRoutes.callStep.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.callStep, input),
    })
    .action({
      name: 'use-computer',
      summary:
        "Send the owner message and queue the scripted model turn that uses the assistant's browser (--kind browser: opens the harness page; --kind browser-two-tabs: opens it and its next page in 2 tabs; --kind browser-navigate: sends the open tab to the harness's next page and reloads it), shell (--kind shell: writes a file and reads it back), shell-processes (--kind shell-processes: runs ps -e in the shell, which waits for approval) or screen (--kind screen: takes a screenshot of the desktop and clicks its middle), with the closing reply --text",
      effect: 'write',
      targets: ['local'],
      input: controlRoutes.useComputer.input,
      data: controlRoutes.useComputer.output,
      run: (input, ctx) => postControl(ctx.drivers.http, controlRoutes.useComputer, input),
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
      run: async (_input, ctx) => ({
        printed: await runHostCLI(ctx, ['reset', '--keep-sessions', '--yes']),
      }),
    })
    .command({
      path: ['sessions'],
      summary: 'Check with `nixie sessions` that a signed-in session has the device name --device',
      effect: 'read',
      args: z.strictObject({ device: z.string().min(1) }),
      data: z.strictObject({ sessions: sessionsSchema }),
      run: (args, ctx) => readSessionCheck(ctx, args.device),
    })
    .command({
      path: ['conversation', 'turn'],
      summary:
        'Check that the records since `use` hold the owner message --message, then the reply --reply, waiting up to --wait-ms (10000 by default)',
      effect: 'read',
      args: z.strictObject({
        message: z.string().min(1),
        reply: z.string().min(1),
        waitMs: z.int().positive().optional(),
      }),
      data: conversationTurnSchema,
      run: (args, ctx) => readConversationTurn(ctx.drivers.stream, args),
    })
    .command({
      path: ['task'],
      summary:
        'Check that the task named --name is in the state --state, and that its last record is --record',
      effect: 'read',
      args: z.strictObject({
        name: z.string().min(1),
        state: z.string().min(1),
        record: z.string().min(1),
      }),
      data: controlRoutes.tasks.output,
      run: async (args, ctx) => {
        refuseHarnessless(ctx.target, 'task');

        const listed = await postControl(ctx.drivers.http, controlRoutes.tasks, {});

        throwRefusal(pickTaskRefusal(listed.tasks, args), listed);

        return listed;
      },
    })
    .command({
      path: ['model', 'received'],
      summary: 'Check that a request of the scripted model holds --text, waiting up to 10 seconds',
      effect: 'read',
      args: z.strictObject({ text: z.string().min(1) }),
      data: controlRoutes.modelReceived.output,
      run: (args, ctx) => readModelReceived(ctx, args.text),
    })
    .command({
      path: ['proposals'],
      summary:
        'Check that one call of the tool --tool waits for your answer (--waiting pending), or none does (--waiting none), waiting up to --wait-ms (no wait by default)',
      effect: 'read',
      args: z.strictObject({
        tool: z.string().min(1),
        waiting: z.enum(['pending', 'none']),
        waitMs: z.int().positive().optional(),
      }),
      data: controlRoutes.actionProposals.output,
      run: (args, ctx) => {
        refuseHarnessless(ctx.target, 'proposals');

        return waitForProposals(
          () => postControl(ctx.drivers.http, controlRoutes.actionProposals, {}),
          args,
        );
      },
    })
    .command({
      path: ['model', 'input'],
      summary:
        "Check that the model's last input holds the text --contains, waiting up to --wait-ms (10000 by default), and return that input; the outcome of an approved call reaches the model in it",
      effect: 'read',
      args: z.strictObject({ contains: z.string().min(1), waitMs: z.int().positive().optional() }),
      data: controlRoutes.modelInput.output,
      run: (args, ctx) => {
        refuseHarnessless(ctx.target, 'model input');

        return waitForModelInput(
          () => postControl(ctx.drivers.http, controlRoutes.modelInput, {}),
          args,
        );
      },
    })
    .command(gmailSentCommand)
    .command(liveOpensCommand)
    .command({
      path: ['prod', 'conversation'],
      summary:
        "Check that prod's conversation answers a read with the read-only token, and count the records it returned",
      effect: 'read',
      args: z.strictObject({}),
      data: z.strictObject({ recordCount: z.int().nonnegative() }),
      run: async (_args, ctx) => {
        refuseOffProd(ctx.target, 'prod conversation');

        const answer = await readProdCall(ctx.drivers.http, env, '/rpc/conversation/read', {
          thread: 'conversation',
          limit: 5,
        });

        const page = z.object({ records: z.array(z.unknown()) }).parse(answer);

        return { recordCount: page.records.length };
      },
    })
    .command({
      path: ['prod', 'tasks'],
      summary:
        "Check that prod's task list answers a read with the read-only token, and count its tasks",
      effect: 'read',
      args: z.strictObject({}),
      data: z.strictObject({ taskCount: z.int().nonnegative() }),
      run: async (_args, ctx) => {
        refuseOffProd(ctx.target, 'prod tasks');

        const answer = await readProdCall(ctx.drivers.http, env, '/rpc/tasks/list', {});

        const listed = taskListSchema.parse(answer);

        return { taskCount: listed.tasks.length };
      },
    })
    .command({
      path: ['prod', 'health'],
      summary: "Check that prod's nixie reports itself ready",
      effect: 'read',
      args: z.strictObject({}),
      data: z.strictObject({ status: z.string() }),
      run: (_args, ctx) => {
        refuseOffProd(ctx.target, 'prod health');

        return readProdHealth(env);
      },
    })
    .check({
      name: 'prod-version',
      targets: ['prod'],
      input: z.strictObject({}),
      data: z.strictObject({ version: z.string() }),
      timeoutMs: 30_000,
      run: () => readProdVersion(env),
    })
    .check({
      name: 'prod-health',
      targets: ['prod'],
      input: z.strictObject({}),
      data: z.strictObject({ status: z.string() }),
      timeoutMs: 30_000,
      run: () => readProdHealth(env),
    })
    .check({
      name: 'prod-errors',
      targets: ['prod'],
      input: z.strictObject({}),
      data: z.strictObject({ errorLines: z.int().nonnegative() }),
      timeoutMs: 30_000,
      run: () => readProdErrors(env),
    })
    .check({
      name: 'nixie',
      targets: ['local', 'preview'],
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
        summary: 'Sign a browser in with an enrol code',
        paths: featurePaths['sign-in-enrol'],
      },
      {
        name: 'chat-turn',
        summary: 'Send a message, and see the reply after it',
        paths: featurePaths['chat-turn'],
      },
      {
        name: 'memory-approval',
        summary: 'Approve a proposed memory',
        paths: featurePaths['memory-approval'],
      },
      {
        name: 'policy-proposal',
        summary: 'Approve a call that an ask rule held unrun',
        paths: featurePaths['policy-proposal'],
      },
      {
        name: 'task-control',
        summary: 'Pause and resume a task, and see its records agree',
        paths: featurePaths['task-control'],
      },
      {
        name: 'coding-session',
        summary: 'Start a coding session from chat',
        paths: featurePaths['coding-session'],
      },
      ...callFeatures,
      {
        name: 'drawing',
        summary: 'Draw a picture, edit it, and list both',
        paths: featurePaths.drawing,
      },
      {
        name: 'images-page',
        summary: 'Browse and forget images',
        paths: featurePaths['images-page'],
      },
      {
        name: 'notebook-pages',
        summary: 'Browse notes, open a private one, forget one',
        paths: featurePaths['notebook-pages'],
      },
      {
        name: 'google-connections',
        summary: 'Connect a Google account and forget it',
        paths: featurePaths['google-connections'],
      },
      {
        name: 'mcp-servers',
        summary: 'Connect an MCP server, see its tools and approve one',
        paths: featurePaths['mcp-servers'],
      },
      ...computerFeatures,
      ...lastFeatures,
    )
    .shared(...sharedPaths)
    .ignore(...ignoredPaths)
    .build();
}
