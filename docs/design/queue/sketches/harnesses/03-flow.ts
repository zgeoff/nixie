// Harnesses: each flow as commented code. Not compiled. No package imports this file.
// Shapes: 02-types.ts. Where a doc and a sketch differ, the sketch wins for shapes and the doc
// wins for rules. The helper names here are this sketch's own.

// ---- A. The session position of a step ----

// pickSessionPosition takes the harness's `session` beside its built input.
function pickSessionPosition(input): SessionPosition {
  if (input.marks.isInvalidated) return { state: 'invalidated', cause: 'forget' };

  // A stored point that the harness does not own reads as no point. A harness with no session
  // owns none.
  const boundary = input.session?.owns(input.boundary) ? input.boundary : null;

  if (boundary === null) {
    if (input.marks.isSummarized) return { state: 'summarized' };

    // An opening, no summary, and no point the harness owns. (open: agent-sdk unkept)
    if (input.marks.hasOpening) return { state: 'unkept' };

    return { state: 'fresh' };
  }

  if (!input.marks.hasOpening) return { state: 'lost', boundary };

  if (isPersonaChanged(input)) return { state: 'invalidated', cause: 'persona', boundary };

  // compaction-due only for a harness with `summarize` and `context-window`
  return { state: isDue(input) ? 'compaction-due' : 'resumable', boundary };
}

// Position                          Event               Next
// fresh, invalidated, unkept        open                resumable when `ended` carries a point;
//                                                       unkept when the harness has no session
// summarized, lost                  open                resumable
// resumable                         resume              resumable
// compaction-due                    compact, or resume  summarized, or resumable

// ---- B. What a step sends and stores ----

async function runStepTurn(step, harness: Harness) {
  const position = pickSessionPosition({ ...step, session: harness.session });

  const frame = {
    type: 'turn',
    profile: harness.toTurnProfile('kept'),
    limits: {
      modelCalls: harness.capabilities.has('turn-limit') ? step.modelCalls : null,
      toolCallWaitMs: harness.toolCallWaitMs,
    },
    // `resume` is a key only when the harness has a session
    ...(harness.session ? { resume: position.boundary ?? null } : {}),
  };

  send(encodeHostFrame(harness.capabilities, frame)); // throws, and sends nothing, on a gap

  // The live inbox reader starts only with `live-messages`. Without it, a message that arrives
  // mid-turn is never acknowledged, the `wait` commit finds it unread, the task is `ready`, and
  // the next step opens with it.
  if (harness.capabilities.has('live-messages')) startLiveInbox(step);

  // An `interrupt` frame goes out only with `interrupt`. A `summarize` frame goes out only from
  // `compaction-due`, which a harness without `summarize` never reaches.

  const ended = await readEnded();

  // A broken contract fails the step:
  // - a point from a harness with no session, or no point from a harness with one;
  // - a `context` from a harness without `context-window`.
  checkEndedAgainst(harness, ended);

  return buildStepResult({
    sessionBoundary: harness.session ? ended.boundary : null,
    outcome: ended.outcome, // written to model.turn_ended
  });
}

// isContextOverflow(ended)  -> ended.outcome === "overflow"
// hasFinishedTurn(record)   -> record.outcome === "finished", on the record the step just built
//
// An overflow on an opened turn fails the step. An overflow on a resumed turn of a harness with
// `summarize` starts the overflow compaction. On a resumed turn of a harness without it, the step
// stores no point, and the next step rebuilds.

// ---- C. How each guest fills `outcome` ----

// The first row that matches wins.
function pickAgentSDKOutcome(result, wasInterrupted): TurnOutcome {
  if (['blocking_limit', 'prompt_too_long'].includes(result.terminalReason)) return 'overflow';

  if (result.subtype === 'error_max_turns') return 'limit';

  if (result.subtype === 'success' && result.stopReason === 'end_turn') return 'finished';

  if (wasInterrupted) return 'interrupted'; // an `interrupt` frame arrived

  return 'stopped'; // a refusal, an output cap, any other result
}

function pickCodexOutcome(completed, hitModelCallLimit): TurnOutcome {
  if (completed.status === 'completed') return 'finished';

  // status "interrupted"
  if (hitModelCallLimit) return 'limit'; // after the guest's own interrupt at limits.modelCalls

  return 'interrupted';
}

// A `turn/completed` with the status `failed` sends `failed`, never `ended`.

// ---- D. The Codex guest: one turn ----

async function runCodexTurn(frame: TurnFrame) {
  checkCLIVersion(); // the guest refuses any version but the image's pinned one

  writeCodexConfig({
    // a custom model provider on frame.profile.baseURL, with supports_websockets = false
    // nixie's MCP server over HTTP at frame.tools.url, with the step token, required = true,
    //   tools approved, and the tool-call timeout from frame.limits.toolCallWaitMs when it is a
    //   number (open: codex tool-call timeout)
    // tool_output_token_limit at the top level (open: codex tool output limit)
    // Codex's own skills, agents and project docs off, and each feature that adds text to the
    //   model's input unasked (open: codex config keys)
  });

  makeWorkDir(); // its own empty git repository, with no remote

  const server = spawn('codex', ['app-server']); // stdio JSON-RPC

  const thread = await server.request('thread/start', {
    model: frame.profile.model,
    cwd,
    baseInstructions: frame.systemPrompt,
  });

  const turn = await server.request('turn/start', { threadId: thread.id, input: frame.input });

  let calls = 0;
  let hitModelCallLimit = false;

  for await (const note of server.notifications) {
    if (note.method === 'item/completed' && note.item.type === 'agentMessage') {
      emit({ type: 'assistant' /* the message's text and tool uses */ });
    }

    // A `call` frame needs both: the turn is one this process started, and `total` grew by `last`.
    if (note.method === 'thread/tokenUsage/updated' && isOwnTurn(note) && grewByLast(note)) {
      emit({ type: 'call', usage: toCallUsage(note.last) });

      calls += 1;

      if (frame.limits.modelCalls !== null && calls >= frame.limits.modelCalls) {
        hitModelCallLimit = true;

        await server.request('turn/interrupt', { threadId: thread.id, turnId: turn.id });
      }
    }

    if (note.method === 'turn/completed') {
      if (note.status === 'failed') return emit({ type: 'failed' });

      return emit({
        type: 'ended',
        outcome: pickCodexOutcome(note, hitModelCallLimit),
        stopReason: null,
        // no boundary and no context
      });
    }

    if (note.method === 'error') return emit({ type: 'failed' });
  }

  emit({ type: 'failed' }); // the stream closed
}

// Host frame -> Codex request
//   interrupt -> turn/interrupt with the thread and turn IDs
//   purge     -> remove the Codex home folder's session state, then `purged`

// Usage of one call:
//   uncached input = input - cached - cache write
//   cache read     = cached
//   cache write    = counted at the longer lifetime

// ---- E. The request rewriter of a profile outside Claude ----

async function runAgentSDKTurnOrSummary(frame: TurnFrame | SummarizeFrame) {
  const rewriter = startRequestRewriter(frame); // null when profile.requestRewrite is null

  // A listener that cannot bind throws here, before the CLI starts.

  const options = buildQueryOptions(frame, {
    baseURL: rewriter?.url ?? frame.profile.baseURL, // ANTHROPIC_BASE_URL
    noProxy: rewriter ? '127.0.0.1' : undefined, // added to NO_PROXY
  });

  try {
    // The drain loop races each message against a failure. The rewriter's refusal is one more
    // failure in that race. A refusal throws here, and the guest's catch sends
    // { type: "failed", reason: "error", detail: <the refusal's text> }.
    await drain(query(options), [rewriter?.refused]);
  } finally {
    await rewriter?.stop();
  }
}

// One request from the CLI.
function handleRequest(request, frame, state) {
  if (state === 'refused') return refuse(state.first); // every request after the first refusal

  if (request.method === 'GET' && isModelList(request.path)) return forward(request);

  const endpoint = matchEndpoint(request); // "messages" | "count_tokens" | null

  if (endpoint === null) return refuse('otherRequest');

  const result = rewriteModelRequest(endpoint, request.body, {
    systemPrompt: frame.systemPrompt,
    providerPin: frame.profile.requestRewrite.providerPin,
  });

  if (!result.ok) return refuse(result.error);

  // The frame's baseURL, whole, then the path and query the CLI sent. The base URL's own path is
  // in front: a proxy route's ID, and the `~in.` segment when the step has a capture.
  return sendUpstream(frame.profile.baseURL + request.pathAndQuery, result.body);
}

function rewriteModelRequest(endpoint, body, rule): RewriteResult {
  const json = parseJSONOrNull(body);

  if (json === null || !isListOfTextBlocks(json.system))
    return { ok: false, error: 'notTextBlocks' };

  // The tail of the system blocks that equals nixie's system prompt. How the CLI splits the prompt
  // into blocks decides the compare. (open: system blocks probe)
  const start = findTailStart(json.system, rule.systemPrompt);

  if (start === null) return { ok: false, error: 'noTail' };

  json.system = json.system.slice(start); // each block as it came, cache marker included

  if (endpoint === 'messages' && rule.providerPin !== null) {
    Object.assign(json, buildProviderOrder(rule.providerPin));
  }

  return { ok: true, body: JSON.stringify(json) };
}

// refuse(): answers the CLI with a 400 in the Messages error shape, sends nothing upstream, and
// settles `refused`. Texts: 02-types.ts, section L.

// ---- F. The turn-input log: a capture, from a step's start to its end ----

async function openCapture(step, profile, role): Promise<{ baseURL: string }> {
  if (!isLogOn() || !config.roles.includes(role)) return { baseURL: profile.baseURL };

  const source = findSource(profile.baseURL); // the source whose base_url the profile's starts with

  if (source === null) {
    await write('model.input_missed', { reason: 'no_capture_point', count: 1 });

    return { baseURL: profile.baseURL };
  }

  try {
    const captureID = crypto.randomUUID();

    const pair = await generateP256KeyPair();
    const keyID = await sealPrivateKey(pair.privateKey); // under a fresh key in keys.db

    await write('model.input_capture_opened', { captureID, keyID /* 02-types.ts, section O */ });

    // one path segment after the route ID
    return {
      baseURL: `${profile.baseURL}/~in.${encodeTag({ captureID, sealTo: pair.publicKey })}`,
    };
  } catch {
    logLine(reasonCode); // a reason code, and no text of a request

    return { baseURL: profile.baseURL }; // the turn runs with no tag
  }
}

// The counting proxy, on each request.
function handleProxyRequest(request) {
  const tag = takeTag(request.path); // removes the `~in.` segment before the endpoint match
  const endpoint = findProxyEndpoint(request.path);

  // the proxy's model check and count are as they are without a tag

  if (tag && config.capture && ['messages', 'responses'].includes(endpoint)) {
    // Not awaited: the reply never waits for the write. No header reaches the capture.
    void spool(tag, request.body).catch((reason) => writeMissFile(tag, reason));
  }

  const reply = sendUpstream(request);

  // The model API answers, with any status: rename `.part` to `.cap`.
  // The model API never answers: remove the `.part` file.
  return reply;
}

// At its start the proxy removes every `.part` file in the spool.

// nixie, while a capture is open: once a second, and once more at the close.
async function takeInSpoolFile(file, capture) {
  const { header, body } = openSpoolFile(file, capture.privateKey); // else: undecodable

  check(body.length === header.bytes && sha256(body) === header.sha256); // else: undecodable

  if (options.holdsOwnValue(body)) {
    await write('model.input_missed', { reason: 'holds_own_value', count: 1 });

    return remove(file);
  }

  const inputID = crypto.randomUUID();

  const keyID = await makeKey(); // a fresh key of the request's own

  await writeFile(`${dataDir}/turn-inputs/${inputID}.bin`, seal(body, keyID, inputID));
  await write('model.input_logged', { inputID, call: capture.nextCall /* section O */ });
  await remove(file);
}

// A `.miss` file becomes one model.input_missed with the proxy's reason.
// A file of a closed capture: capture_closed.
// The triggers of unknown_capture and store_unavailable: (open: miss reason triggers)
// The store file or the record fails 5 passes in a row: intake_failed, and the file is removed.

async function closeCapture(capture, cause) {
  await waitUntilNoPartFile(capture, config.close_wait);
  await takeInEvery(capture, ['.cap', '.miss']);
  await destroyKey(capture.keyID); // only after the intake
  await write('model.input_capture_closed', { captureID: capture.id, cause /* logged, missed */ });

  // Fewer than the step's `call` frames: one miss with the gap. More: nothing.
  const gap = step.callFrames - (capture.logged + capture.missed);

  if (gap > 0) await write('model.input_missed', { reason: 'not_received', count: gap });
}

// ---- G. The turn-input log: removal, the sweep and the start ----

// One function, for every cause. Each step is safe to run twice.
async function removeTurnInput(inputID, cause) {
  await deleteKey(inputID); // throws when the key cannot be deleted
  await checkpointKeyStore();
  await unlink(`${dataDir}/turn-inputs/${inputID}.bin`);
  await write('model.input_removed', { inputID, cause });
}

// The sweep: at start, every 10 minutes and after each intake.
//   1. remove each request past retention.days            (cause: retention)
//   2. remove the oldest until the store fits the bytes   (cause: byte_bound)

// A forget, inside the session cleanup:
//   1. close the open captures of the covered threads     (cause: forget)
//   2. removeTurnInput for each request that on_forget covers
//   A throw leaves the cleanup incomplete, and the cleanup runs again.

// The server's start:
//   1. close every open capture                           (cause: server_start)
//   2. reconcile: remove a file with no row and a key with no file; mark a row with no file as
//      removed with `missing`

// turnInputs.open:
//   1. commit model.input_opened; return no body when the commit fails
//   2. read the file, open it with the request's key, return the body
