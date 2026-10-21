import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';
import type { HostFrame } from '@heynixie/wire';
import { toolOutputLimitTokens } from '@heynixie/wire';
import { getConfigDir } from './get-config-dir';
import { getHome } from './get-home';
import { getWorkDir } from './get-work-dir';
import { toolServerName } from './tool-server-name';

export type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

export type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface QueryContext {
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly toolServer: McpServerConfig | null;
}

export function buildQueryOptions(
  turn: TurnFrame | SummarizeFrame,
  context: QueryContext,
): Options {
  const home = getHome(context.env);

  return {
    tools: [],
    allowedTools: context.toolServer === null ? [] : [`mcp__${toolServerName}`],
    ...(context.toolServer === null ? { maxTurns: 1 } : {}),

    thinking: { type: 'adaptive', display: 'summarized' },
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

      // Without a lifetime, the CLI writes 5-minute cache entries on an API-key or bearer profile.
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

// The guest holds only a placeholder credential, and the sandbox's grant replaces the auth header
// on the way out.
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

    // The CLI's background calls name a small model, which an endpoint that serves one model lacks.
    ANTHROPIC_SMALL_FAST_MODEL: turn.profile.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: turn.profile.model,
    CLAUDE_CODE_EFFORT_LEVEL: turn.profile.effort,

    // The sandbox's grant covers only the model API's host, so the CLI sends no other traffic.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',

    DISABLE_COMPACT: '1',
    DISABLE_AUTOUPDATER: '1',

    // the CLI saves a tool result past its tool-output limit to a file, which the model has no tool
    // to read, unless large output files are off; then it cuts the result and keeps it inline
    MAX_MCP_OUTPUT_TOKENS: String(toolOutputLimitTokens),
    ENABLE_MCP_LARGE_OUTPUT_FILES: '0',
  };
}
