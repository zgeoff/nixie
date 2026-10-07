// Holds MARK_HOLD calls until the owner's decision service answers. Each long-poll stays under the
// 30 s cap on $.http.fetch, and the wait inside it does not count against the hook's 10 s limit.
async function readDecision($, url) {
  const response = await $.http.fetch(url);
  return JSON.parse(response.text).decision;
}

async function waitForDecision($, request, poll = 1) {
  const decision = await readDecision($, request.url);
  await $.ui.log(
    `nixie poll ${poll} decision=${decision} budget=${JSON.stringify(request.budget)}`,
    {
      to: 'debug',
    },
  );
  if (decision === 'pending') {
    return waitForDecision($, request, poll + 1);
  }
  return { decision, polls: poll };
}

async function handleToolCall($, e, next) {
  if (!e.command.includes('MARK_HOLD')) {
    return next(e);
  }
  const base = await $.env.get('NIXIE_DECIDER_URL'),
    started = Date.now(),
    verdict = await waitForDecision($, {
      budget: next.budget,
      url: `${base}/decide?tool_use_id=${e.tool_use_id}`,
    });
  if (verdict.decision === 'allow') {
    return next(e);
  }
  return {
    deny: `nixie-hold-poll: the owner refused this command after ${Date.now() - started} ms and ${verdict.polls} polls.`,
  };
}

function handleFailure($, e, next) {
  return {
    deny: `nixie policy failed (${next.error.kind}: ${next.error.message}), so the command did not run.`,
  };
}

export function register(on) {
  // `.catch` here is the mods API's error handler on a registration, not a promise method.
  // oxlint-disable-next-line promise/prefer-await-to-then
  on('tool.call', { tool: 'Bash' }, handleToolCall).catch(handleFailure);
}
