// Runs one probe of GPT-Live over WebRTC with a server sideband, and logs every event to results/.
// Usage: OPENAI_API_KEY=… bun run-probe.ts <delegation|cut|reconnect|quiet|parts|holds> [--model gpt-live-1]
//   parts only: [--trials 8] [--shapes a,b,c] [--gap 3000]: trials of each shape, each in a session
//   of its own, with the gap between parts fixed instead of taking turns at 300, 550 and 800 ms
//   holds only: --hold 15000 [--trials 6] [--no-line]: trials that hold the delegation this long
//   before the whole answer, with the holding line at 1.5 s unless --no-line
import { appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { attachSideband } from './attach-sideband.ts';
import { createLiveSession } from './create-live-session.ts';
import { readSpeech } from './read-speech.ts';
import { startDevice } from './start-device.ts';
import { waitForQuiet } from './wait-for-quiet.ts';
import type { Call } from './with-call.ts';
import { withCall } from './with-call.ts';

const voicePrompt = [
  'You are the voice of a personal assistant on a call with the one person it works for.',
  'Answer greetings and small talk yourself, in a sentence or two.',
  "Delegate every request that needs the person's calendar, reminders, messages, facts or any action",
  'to the backend, and never answer such a request yourself.',
  'When the backend sends an answer, say it closely and in full, and add no facts of your own.',
].join(' ');

const delegationTimeoutMs = 12_000;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    gap: { type: 'string' },
    hold: { type: 'string' },
    model: { default: 'gpt-live-1', type: 'string' },
    'no-line': { default: false, type: 'boolean' },
    shapes: { default: 'a,b,c', type: 'string' },
    trials: { default: '8', type: 'string' },
  },
});
const scenario = z.enum(['delegation', 'cut', 'reconnect', 'quiet', 'parts', 'holds']).parse(positionals[0]);
const key = z.string().min(1).parse(process.env.OPENAI_API_KEY);
const label = `${scenario}-${values.model}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`;
const session = { delegation: { type: 'client' }, instructions: voicePrompt, model: values.model, store: false };

async function say(call: Call, text: string): Promise<number> {
  const speech = await readSpeech(text, call.key);
  const fromIndex = call.sideband.log.length;
  call.mark('speak', { text, ttsCharacters: speech.characters });
  const spoken = await call.device.speak(speech.pcmBase64);
  call.mark('spoke', spoken);
  return fromIndex;
}

async function waitForDelegation(call: Call, fromIndex: number): Promise<string | undefined> {
  const created = await call.sideband.waitFor(
    (event) => event.type === 'session.delegation.created',
    delegationTimeoutMs,
    fromIndex,
  );
  return z.object({ delegation: z.object({ id: z.string() }) }).safeParse(created?.event).data?.delegation.id;
}

function appendCommentary(call: Call, delegationID: string | null, eventID: string, content: string): void {
  call.sideband.send({ content, delegation_id: delegationID, event_id: eventID, type: 'session.commentary.append' });
}

// Questions 1, 2 and 4: what a delegation carries, an answer in parts, a late part, an unanswered
// delegation, an empty part and an unknown delegation ID.
async function runDelegationProbe(call: Call): Promise<void> {
  await Bun.sleep(1500);
  await say(call, "Hi there, how's your day going?");
  await waitForQuiet(call.sideband, 2500, 12_000);

  const first = await waitForDelegation(call, await say(call, "What's on my calendar tomorrow morning?"));
  if (!first) {
    call.mark('no_delegation');
    return;
  }
  await Bun.sleep(2000);
  appendCommentary(call, first, 'part_1', 'Tomorrow morning you have two things.');
  await Bun.sleep(4000);
  appendCommentary(call, first, 'part_2', 'At nine, a dentist check-up on Elm Street.');
  await Bun.sleep(4000);
  appendCommentary(call, first, 'part_3', 'At eleven, a call with the garden centre about the new fence.');
  await waitForQuiet(call.sideband, 3000, 15_000);
  await Bun.sleep(6000);
  appendCommentary(call, first, 'late_part', 'One more thing: the dentist asked you to arrive ten minutes early.');
  await waitForQuiet(call.sideband, 3000, 15_000);

  const second = await waitForDelegation(call, await say(call, 'Also, can you remind me to water the plants tonight?'));
  if (!second) {
    call.mark('no_delegation');
    return;
  }
  call.mark('leave_unanswered');
  await Bun.sleep(15_000);
  appendCommentary(call, second, 'empty_part', '');
  await Bun.sleep(3000);
  appendCommentary(call, second, 'second_answer', "Done. I'll remind you at eight tonight to water the plants.");
  await waitForQuiet(call.sideband, 3000, 15_000);
  appendCommentary(call, 'item_unknown123', 'unknown_id', 'This should not be spoken.');
  await Bun.sleep(3000);
}

const cutTrials = [
  {
    afterChars: 40,
    answer:
      'This week you have four things. On Monday, the plumber comes between eight and ten to look at the kitchen tap. On Tuesday, the book club meets at seven at the library. On Wednesday, your car is due for its service at the garage on Mill Road. And on Friday, you are having dinner with your sister at the Italian place near the station.',
    request: 'What does my week look like?',
  },
  {
    afterChars: 110,
    answer:
      'You have three unread messages. The first is from the school, saying the trip to the museum moved to next Thursday and needs a signed form by Monday. The second is from the bike shop, saying your repair is ready and they close at five. The third is from the neighbour, asking if you could keep an eye on their cat over the weekend.',
    request: 'Read me my new messages.',
  },
  {
    afterChars: 180,
    answer:
      'Here is the forecast. Today stays dry with sunny spells and a high of seventeen degrees. Tomorrow brings rain from mid morning, heavy at times, clearing by the evening. Saturday is cooler, around twelve degrees, with a strong wind from the north. Sunday looks the best day of the weekend, bright and calm, with a high of fifteen degrees.',
    request: "What's the weather going to do this weekend?",
  },
];

// Question 3: talk over a long answer after it has spoken some characters, three times.
async function runCutProbe(call: Call): Promise<void> {
  await Bun.sleep(1500);
  for (const [index, trial] of cutTrials.entries()) {
    const delegationID = await waitForDelegation(call, await say(call, trial.request));
    if (!delegationID) {
      call.mark('no_delegation', { trial: index });
      continue;
    }
    await Bun.sleep(1500);
    const answerIndex = call.sideband.log.length;
    appendCommentary(call, delegationID, `answer_${index}`, trial.answer);
    await waitForSpokenChars(call, answerIndex, trial.afterChars);
    call.mark('interrupt', { afterChars: trial.afterChars, trial: index });
    await say(call, 'Sorry, hold on a second.');
    await waitForQuiet(call.sideband, 3000, 15_000);
    await Bun.sleep(3000);
  }
}

async function waitForSpokenChars(call: Call, fromIndex: number, chars: number): Promise<void> {
  const deadlineMs = Date.now() + 30_000;
  while (Date.now() < deadlineMs) {
    const spoken = call.sideband.log
      .slice(fromIndex)
      .filter((entry) => entry.event.type === 'session.output_transcript.delta')
      .map((entry) => String(entry.event.delta))
      .join('');
    if (spoken.length >= chars) {
      return;
    }
    await Bun.sleep(50);
  }
}

// Question 5 and the device's own permissions: a second session for the same call.
async function runReconnectProbe(): Promise<void> {
  const restricted = {
    ...session,
    client: {
      data_channel: {
        allowed_client_events: [],
        allowed_server_events: [{ type: 'session.input_transcript.delta' }, { type: 'session.output_transcript.delta' }],
      },
    },
  };
  await withCall({ key, label, session: restricted }, async (call) => {
    await Bun.sleep(1500);
    await say(call, 'Hi, just so you know, my favourite colour is green.');
    await waitForQuiet(call.sideband, 2500, 12_000);

    call.mark('device_sends_commentary');
    await call.device.sendOnChannel({ content: 'Say the word banana.', delegation_id: null, type: 'session.commentary.append' });
    await Bun.sleep(4000);

    call.mark('reuse_offer');
    call.mark('reuse_offer_result', await probeReusedOffer(call.sdpOffer));

    call.mark('restart_offer');
    const restartOffer = await call.device.createRestartOffer();
    const next = await createLiveSession({
      key,
      sdpOffer: restartOffer,
      session: {
        ...restricted,
        input: [
          { content: [{ text: 'Hi, just so you know, my favourite colour is green.', type: 'input_text' }], role: 'user', type: 'message' },
        ],
      },
    });
    call.mark('restart_offer_result', next.kind === 'created' ? { kind: 'created', sessionID: next.sessionID } : next);
    if (next.kind === 'created') {
      const nextSideband = await attachSideband(key, next.sessionID);
      try {
        await call.device.applyAnswer(next.sdpAnswer).then(
          () => call.mark('restart_answer_applied'),
          (error: unknown) => call.mark('restart_answer_refused', { error: String(error) }),
        );
        await Bun.sleep(3000);
        call.mark('peer_state', { state: await call.device.readPeerState() });
        await say(call, "What's my favourite colour?");
        await Bun.sleep(8000);
      } finally {
        const closed = await nextSideband.close();
        call.mark('restart_session_log', { closed, log: nextSideband.log });
      }
    }

    call.mark('fork_attempt');
    const other = await startDevice();
    try {
      const fork = await createLiveSession({
        key,
        path: `/v1/live/sessions/${call.sessionID}/fork`,
        sdpOffer: await other.createOffer(),
        session: { store: false },
      });
      call.mark('fork_result', fork.kind === 'created' ? { kind: 'created', sessionID: fork.sessionID } : fork);
      if (fork.kind === 'created') {
        await (await attachSideband(key, fork.sessionID)).close();
      }
    } finally {
      await other.close();
    }
  });
}

async function probeReusedOffer(offer: string): Promise<Record<string, unknown>> {
  const reused = await createLiveSession({ key, sdpOffer: offer, session });
  if (reused.kind === 'refused') {
    return reused;
  }
  const orphan = await attachSideband(key, reused.sessionID);
  return { closed: await orphan.close(), kind: 'created', sessionID: reused.sessionID };
}

// The automatic acknowledgement held back by an empty thinking part sent at once, twice, then a
// line said through a commentary part with no delegation, as the contract's `say` would send it.
async function runQuietProbe(call: Call): Promise<void> {
  await Bun.sleep(1500);
  for (const [index, request] of ["What's on my calendar tomorrow morning?", 'Read me my new messages.'].entries()) {
    const delegationID = await waitForDelegation(call, await say(call, request));
    if (!delegationID) {
      call.mark('no_delegation');
      continue;
    }
    call.sideband.send({ content: '', delegation_id: delegationID, event_id: `quiet_${index}`, type: 'session.thinking.append' });
    await Bun.sleep(8000);
    appendCommentary(call, delegationID, `answer_${index}`, 'At nine tomorrow, a dentist check-up on Elm Street.');
    await waitForQuiet(call.sideband, 3000, 15_000);
  }
  appendCommentary(call, null, 'say_line', 'I dropped out for a second.');
  await waitForQuiet(call.sideband, 3000, 10_000);
}

// The same facts in each shape: (a) the whole answer as one part, (b) a lead-in sentence and then
// one statement per part, (c) the statements alone, each a full statement.
const partsAnswers = [
  {
    leadIn: 'Tomorrow morning you have two things.',
    request: "What's on my calendar tomorrow morning?",
    statements: [
      'At nine tomorrow, you have a dentist check-up on Elm Street.',
      'At eleven, you have a call with the garden centre about the new fence.',
    ],
  },
  {
    leadIn: 'You have two new messages.',
    request: 'Read me my new messages.',
    statements: [
      'The school says the museum trip moved to next Thursday.',
      'The bike shop says your repair is ready, and they close at five.',
    ],
  },
  {
    leadIn: 'The weekend splits in two.',
    request: "What's the weather doing this weekend?",
    statements: ['Saturday is cool and windy, around twelve degrees.', 'Sunday is bright and calm, with a high of fifteen.'],
  },
];
const partsShapes = ['a', 'b', 'c'] as const;
const partsGapsMs = [300, 550, 800];
// The design sends the holding line 1500 ms after a hand-off, so the first part lands before it.
const firstPartAfterMs = 1200;
// About $1.50 of sessions at $0.05 a minute, and a trial that runs this long has gone wrong.
const partsBudgetMs = 1_800_000;
const partsTrialLimitMs = 90_000;

function pickParts(shape: (typeof partsShapes)[number], answer: (typeof partsAnswers)[number]): string[] {
  return match(shape)
    .with('a', () => [[answer.leadIn, ...answer.statements].join(' ')])
    .with('b', () => [answer.leadIn, ...answer.statements])
    .with('c', () => answer.statements)
    .exhaustive();
}

// The design's hold and sentence parts: each trial is a session of its own, so no earlier answer
// sits in GPT-Live's context. Shapes take turns, and a trial without a delegation runs again.
async function runPartsProbe(): Promise<void> {
  const trials = z.coerce.number().int().positive().parse(values.trials);
  const shapes = z.array(z.enum(partsShapes)).parse(values.shapes.split(','));
  const fixedGapMs = values.gap === undefined ? undefined : z.coerce.number().int().positive().parse(values.gap);
  const valid = new Map<string, number>(shapes.map((shape) => [shape, 0]));
  let spentMs = 0;
  for (let attempt = 0; attempt < trials * shapes.length + 6; attempt++) {
    const shape = shapes[attempt % shapes.length];
    const round = valid.get(shape) ?? 0;
    if (round >= trials) {
      continue;
    }
    const answer = partsAnswers[round % partsAnswers.length];
    const gapMs = fixedGapMs ?? partsGapsMs[round % partsGapsMs.length];
    const trialLabel = `parts-${values.model}-${shape}-${round}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`;
    const startedAtMs = Date.now();
    let delegated = false;
    await withCall(
      { key, label: trialLabel, session: { ...session, delegation: { acknowledgement_delay_ms: 800, type: 'client' } } },
      async (call) => {
        call.mark('parts_trial', { answerSet: round % partsAnswers.length, gapMs, shape });
        delegated = await runPartsTrial(call, answer.request, pickParts(shape, answer), gapMs);
      },
    );
    const trialMs = Date.now() - startedAtMs;
    spentMs += trialMs;
    console.log(`${trialLabel}: ${delegated ? 'delegated' : 'no delegation'}, ${Math.round(trialMs / 1000)} s`);
    if (delegated) {
      valid.set(shape, round + 1);
    }
    if (trialMs > partsTrialLimitMs || spentMs > partsBudgetMs) {
      console.log(`stopped: trial took ${trialMs} ms, all trials ${spentMs} ms`);
      return;
    }
  }
}

async function runPartsTrial(call: Call, request: string, parts: readonly string[], gapMs: number): Promise<boolean> {
  await Bun.sleep(1500);
  const delegationID = await waitForDelegation(call, await say(call, request));
  if (!delegationID) {
    call.mark('no_delegation');
    return false;
  }
  call.sideband.send({ content: '', delegation_id: delegationID, event_id: 'hold', type: 'session.thinking.append' });
  await Bun.sleep(firstPartAfterMs);
  const firstPartIndex = call.sideband.log.length;
  for (const [index, part] of parts.entries()) {
    if (index > 0) {
      await Bun.sleep(gapMs);
    }
    appendCommentary(call, delegationID, `part_${index + 1}`, part);
  }
  await call.sideband.waitFor((event) => event.type === 'session.output_transcript.delta', 10_000, firstPartIndex);
  await waitForQuiet(call.sideband, 3000, 25_000);
  await Bun.sleep(2000);
  return true;
}

// The design's hold, its holding line and the whole answer as one part, with a long wait between.
const holdingLine = 'One moment.';
const holdingLineAfterMs = 1500;
// Wall-clock time of every holds trial so far, summed across invocations from results/. $2 of
// sessions at $0.05 a minute; wall time runs longer than billed time, so the cap errs low.
const holdsBudgetMs = 2_400_000;
const holdsSpentPath = new URL('./results/holds-spent.jsonl', import.meta.url).pathname;

// Each trial is a session of its own. The answers take turns, and a trial without a delegation runs
// again. A trial that could cross the budget never starts.
async function runHoldsProbe(): Promise<void> {
  const trials = z.coerce.number().int().positive().parse(values.trials);
  const holdMs = z.coerce.number().int().min(holdingLineAfterMs).parse(values.hold);
  const line = values['no-line'] ? null : holdingLine;
  let spentMs = await readHoldsSpentMs();
  let valid = 0;
  for (let attempt = 0; valid < trials && attempt < trials + 3; attempt++) {
    if (spentMs + holdMs + 60_000 > holdsBudgetMs) {
      console.log(`stopped: ${spentMs} ms spent of ${holdsBudgetMs} ms`);
      return;
    }
    const answer = partsAnswers[valid % partsAnswers.length];
    const text = [answer.leadIn, ...answer.statements].join(' ');
    const trialLabel = `holds-${values.model}-${holdMs}-${line === null ? 'noline' : 'line'}-${valid}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`;
    const startedAtMs = Date.now();
    let delegated = false;
    await withCall(
      { key, label: trialLabel, session: { ...session, delegation: { acknowledgement_delay_ms: 800, type: 'client' } } },
      async (call) => {
        call.mark('hold_trial', { answer: text, answerSet: valid % partsAnswers.length, holdMs, line });
        delegated = await runHoldTrial(call, answer.request, text, holdMs, line);
      },
    );
    const trialMs = Date.now() - startedAtMs;
    spentMs += trialMs;
    await appendFile(holdsSpentPath, `${JSON.stringify({ label: trialLabel, trialMs })}\n`);
    console.log(`${trialLabel}: ${delegated ? 'delegated' : 'no delegation'}, ${Math.round(trialMs / 1000)} s`);
    if (delegated) {
      valid++;
    }
  }
}

async function readHoldsSpentMs(): Promise<number> {
  const file = Bun.file(holdsSpentPath);
  if (!(await file.exists())) {
    return 0;
  }
  return (await file.text())
    .split('\n')
    .filter((row) => row !== '')
    .reduce((sumMs, row) => sumMs + z.object({ trialMs: z.number() }).parse(JSON.parse(row)).trialMs, 0);
}

// Both timers run from the delegation's arrival, as the calls module's would.
async function runHoldTrial(
  call: Call,
  request: string,
  text: string,
  holdMs: number,
  line: string | null,
): Promise<boolean> {
  await Bun.sleep(1500);
  const delegated = await call.sideband.waitFor(
    (event) => event.type === 'session.delegation.created',
    delegationTimeoutMs,
    await say(call, request),
  );
  const delegationID = z.object({ delegation: z.object({ id: z.string() }) }).safeParse(delegated?.event).data
    ?.delegation.id;
  if (!delegated || !delegationID) {
    call.mark('no_delegation');
    return false;
  }
  call.sideband.send({ content: '', delegation_id: delegationID, event_id: 'hold', type: 'session.thinking.append' });
  if (line !== null) {
    await Bun.sleep(Math.max(0, delegated.receivedAtMs + holdingLineAfterMs - Date.now()));
    appendCommentary(call, null, 'holding_line', line);
  }
  await Bun.sleep(Math.max(0, delegated.receivedAtMs + holdMs - Date.now()));
  const answerIndex = call.sideband.log.length;
  appendCommentary(call, delegationID, 'answer', text);
  await call.sideband.waitFor((event) => event.type === 'session.output_transcript.delta', 10_000, answerIndex);
  await waitForQuiet(call.sideband, 3000, 30_000);
  await Bun.sleep(2000);
  return true;
}

// Runs last, so every constant above is initialised before a probe reads it.
await match(scenario)
  .with('delegation', () => withCall({ key, label, session }, runDelegationProbe))
  .with('cut', () => withCall({ key, label, session }, runCutProbe))
  .with('reconnect', () => runReconnectProbe())
  .with('quiet', () =>
    withCall(
      { key, label, session: { ...session, delegation: { acknowledgement_delay_ms: 800, type: 'client' } } },
      runQuietProbe,
    ),
  )
  .with('parts', () => runPartsProbe())
  .with('holds', () => runHoldsProbe())
  .exhaustive();
if (scenario !== 'parts' && scenario !== 'holds') {
  console.log(`logged results/${label}.jsonl`);
}
process.exit(0);
