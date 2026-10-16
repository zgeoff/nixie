// The Agent SDK as the conversation guest's turn sees it in this spike: every export unchanged, and
// query() adding the cache lifetime that the run under test names to the options the production
// builder made. SPIKE_TTL_SETTING sets the CLI's promptCacheTtl setting, and SPIKE_TTL_ENV sets its
// CLAUDE_CODE_PROMPT_CACHE_TTL variable; with neither set, query() passes the options through.
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { query as querySDK } from '@anthropic-ai/claude-agent-sdk';

export * from '@anthropic-ai/claude-agent-sdk';

export function query(params: Parameters<typeof querySDK>[0]): ReturnType<typeof querySDK> {
  const options = buildOptions(params.options ?? {});

  console.log(
    `query: promptCacheTtl ${(options.settings as { promptCacheTtl?: string }).promptCacheTtl ?? '-'}, CLAUDE_CODE_PROMPT_CACHE_TTL ${options.env?.['CLAUDE_CODE_PROMPT_CACHE_TTL'] ?? '-'}`,
  );
  return querySDK({ ...params, options });
}

function buildOptions(options: Options): Options {
  const setting = process.env['SPIKE_TTL_SETTING'] as '5m' | '1h' | undefined;
  const variable = process.env['SPIKE_TTL_ENV'];

  return {
    ...options,
    ...(setting === undefined ? {} : { settings: { ...(options.settings as object), promptCacheTtl: setting } }),
    ...(variable === undefined ? {} : { env: { ...options.env, CLAUDE_CODE_PROMPT_CACHE_TTL: variable } }),
  };
}
