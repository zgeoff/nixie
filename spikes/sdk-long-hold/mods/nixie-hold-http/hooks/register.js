// Holds MARK_HOLD calls on one long-poll to the owner's decision service.
// The wait sits inside $.http.fetch, a mods API call, so it does not count against the hook's limit.
async function readDecision($, url, started) {
  try {
    const response = await $.http.fetch(url);
    return JSON.parse(response.text).decision;
  } catch (error) {
    await $.ui.log(`nixie fetch failed after ${Date.now() - started} ms: ${error.message}`, {
      to: 'debug',
    });
    throw error;
  }
}

async function handleToolCall($, e, next) {
  if (!e.command.includes('MARK_HOLD')) {
    return next(e);
  }
  const base = await $.env.get('NIXIE_DECIDER_URL'),
    started = Date.now();
  await $.ui.log(`nixie hold start budget=${JSON.stringify(next.budget)}`, { to: 'debug' });
  if ((await readDecision($, `${base}/decide?tool_use_id=${e.tool_use_id}`, started)) === 'allow') {
    return next(e);
  }
  return {
    deny: `nixie-hold-http: the owner refused this command after ${Date.now() - started} ms.`,
  };
}

export function register(on) {
  on('tool.call', { tool: 'Bash' }, handleToolCall);
}
