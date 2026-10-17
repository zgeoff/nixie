import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';
import type { HostFrame } from '@heynixie/wire';
import { getConfigDir } from './get-config-dir';
import { getHome } from './get-home';
import { getWorkDir } from './get-work-dir';
import { toolServerName } from './tool-server-name';

export type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

export type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface QueryContext {
  // the guest process's own environment, which holds the sandbox's placeholders and proxy settings
  readonly env: Readonly<Record<string, string | undefined>>;

  // nixie's tool server: the run's HTTP endpoint in production, an in-process server in a test, or
  // null for a summary, which runs with no tools
  readonly toolServer: McpServerConfig | null;
}

// Builds the options of every query(): nixie's tools alone, or none and one model call for a
// summary, a system prompt rendered fresh on every request, and every CLI compaction off. options.env
// replaces the CLI's environment, so each variable goes in by name.
export function buildQueryOptions(
  turn: TurnFrame | SummarizeFrame,
  context: QueryContext,
): Options {
  const home = getHome(context.env);

  return {
    tools: [],
    allowedTools: context.toolServer === null ? [] : [`mcp__${toolServerName}`],
    ...(context.toolServer === null ? { maxTurns: 1 } : {}),
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    skills: [],
    verbatimPrompts: true,
    settings: {
      disableBundledSkills: true,
      autoMemoryEnabled: false,
      autoDreamEnabled: false,
      autoCompactEnabled: false,
      precomputeCompactionEnabled: false,
      idleCompaction: false,

      // the CLI writes 5-minute entries on an API-key or bearer profile unless this sets the lifetime
      promptCacheTtl: turn.profile.cacheTTL,
    },
    mcpServers: context.toolServer === null ? {} : { [toolServerName]: context.toolServer },
    systemPrompt: { type: 'custom', prompt: turn.systemPrompt, snapshot: false },
    cwd: getWorkDir(home),
    env: buildQueryEnv(turn, context.env, home),
    ...(turn.resume === null
      ? {}
      : {
          resume: turn.resume.sessionID,
          resumeSessionAt: turn.resume.messageID,
          forkSession: true,
        }),
  };
}

// the variables the guest passes on from its own environment when they are set: the broker's
// proxy and certificate settings, and the sandbox's loopback bypass
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

// the variable the CLI reads the credential from for each auth header; the guest holds a
// placeholder there, and the grant replaces the header on the way out
const credentialVariables = {
  bearer: 'ANTHROPIC_AUTH_TOKEN',
  'x-api-key': 'ANTHROPIC_API_KEY',
} as const;

function buildQueryEnv(
  turn: Pick<TurnFrame, 'profile'>,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): Record<string, string> {
  const credentialVariable = credentialVariables[turn.profile.authHeader];
  const placeholder = env[credentialVariable];

  if (placeholder === undefined || placeholder === '') {
    throw new Error(
      `the conversation guest has no placeholder credential in ${credentialVariable}`,
    );
  }

  const passed = Object.fromEntries(
    passedVariables.flatMap((name) => {
      const value = env[name];

      return value === undefined ? [] : [[name, value]];
    }),
  );

  return {
    ...passed,
    HOME: home,
    CLAUDE_CONFIG_DIR: getConfigDir(home),
    [credentialVariable]: placeholder,
    ANTHROPIC_BASE_URL: turn.profile.baseURL,
    ANTHROPIC_MODEL: turn.profile.model,

    // the CLI's background calls name a small model, which an endpoint for one model may lack
    ANTHROPIC_SMALL_FAST_MODEL: turn.profile.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: turn.profile.model,
    CLAUDE_CODE_EFFORT_LEVEL: turn.profile.effort,

    // keeps the CLI to the model API's host, the one host its grant covers
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',

    // turns off the automatic compaction and the manual /compact alike
    DISABLE_COMPACT: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}
