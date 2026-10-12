import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';
import type { HostFrame } from '@heynixie/wire';
import { getConfigDir } from './get-config-dir';
import { getHome } from './get-home';
import { getWorkDir } from './get-work-dir';
import { toolServerName } from './tool-server-name';

export type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

export interface QueryContext {
  // the guest process's own environment, which holds the sandbox's placeholders and proxy settings
  readonly env: Readonly<Record<string, string | undefined>>;

  // nixie's tool server: the run's HTTP endpoint in production, an in-process server in a test
  readonly toolServer: McpServerConfig;
}

// the auto-compact window of a profile that sets no context cap
const defaultCompactWindow = 200_000;

// Builds the options of every query(): nixie's tools alone, a system prompt rendered fresh on every
// request, and the SDK's compaction pinned to run only inside a turn. options.env replaces the
// CLI's environment, so each variable goes in by name.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the SDK's MCP config has no readonly form
export function buildQueryOptions(turn: TurnFrame, context: QueryContext): Options {
  const home = getHome(context.env);

  return {
    tools: [],
    allowedTools: [`mcp__${toolServerName}`],
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    skills: [],
    verbatimPrompts: true,
    settings: {
      disableBundledSkills: true,
      autoMemoryEnabled: false,
      autoDreamEnabled: false,
      autoCompactEnabled: true,

      // the profile's context cap, which the CLI compacts within instead of the model's own window
      autoCompactWindow: turn.profile.contextTokens ?? defaultCompactWindow,
      precomputeCompactionEnabled: false,
    },
    mcpServers: { [toolServerName]: context.toolServer },
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
  turn: TurnFrame,
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
    DISABLE_AUTOUPDATER: '1',
  };
}
