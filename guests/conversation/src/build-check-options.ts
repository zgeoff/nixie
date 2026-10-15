import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { CheckRequest } from '@heynixie/wire';

// Builds the options of a checker query(): no tools, no MCP server, no settings, skills or memory,
// no CLI compaction, no saved session, and a JSON verdict as the structured output. options.env replaces the CLI's
// environment, so each variable goes in by name. The conversation keeps its own options apart.
export function buildCheckOptions(
  request: CheckRequest,
  env: Readonly<Record<string, string | undefined>>,
): Options {
  const home = env['HOME'];

  if (home === undefined || home === '') {
    throw new Error('the check guest needs HOME');
  }

  return {
    tools: [],
    allowedTools: [],
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    skills: [],
    persistSession: false,
    settings: {
      disableBundledSkills: true,
      autoMemoryEnabled: false,
      autoDreamEnabled: false,
      autoCompactEnabled: false,
    },
    systemPrompt: request.systemPrompt,
    outputFormat: { type: 'json_schema', schema: verdictSchema },
    cwd: join(home, 'checker'),
    env: buildCheckEnv(request, env, home),
  };
}

// the reason comes first, so the model writes its reasoning before it commits to a verdict
const verdictSchema = {
  type: 'object',
  properties: {
    reason: { type: 'string' },
    verdict: { type: 'string', enum: ['asserted', 'not_asserted', 'unsure'] },
  },
  required: ['reason', 'verdict'],
  additionalProperties: false,
};

// the broker's proxy and certificate settings that the guest passes on when they are set
const passedVariables = [
  'PATH',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
] as const;

const credentialVariables = {
  bearer: 'ANTHROPIC_AUTH_TOKEN',
  'x-api-key': 'ANTHROPIC_API_KEY',
} as const;

// the guest holds a placeholder credential, and the sandbox's grant replaces the header on the way
// out, so the CLI reaches only the model API's host
function buildCheckEnv(
  request: CheckRequest,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): Record<string, string> {
  const credentialVariable = credentialVariables[request.profile.authHeader];
  const placeholder = env[credentialVariable];

  if (placeholder === undefined || placeholder === '') {
    throw new Error(`the check guest has no placeholder credential in ${credentialVariable}`);
  }

  const passed = passedVariables.flatMap((name) => {
    const value = env[name];

    return value === undefined ? [] : [[name, value] as const];
  });

  return {
    ...Object.fromEntries(passed),
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    [credentialVariable]: placeholder,
    ANTHROPIC_BASE_URL: request.profile.baseURL,
    ANTHROPIC_MODEL: request.profile.model,
    ANTHROPIC_SMALL_FAST_MODEL: request.profile.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: request.profile.model,
    CLAUDE_CODE_EFFORT_LEVEL: request.profile.effort,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    DISABLE_COMPACT: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}
