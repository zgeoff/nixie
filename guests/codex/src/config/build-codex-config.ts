import type { codexEfforts } from '@heynixie/wire';
import { toolOutputLimitTokens } from '@heynixie/wire';

export interface CodexConfigInput {
  readonly model: string;
  readonly effort: (typeof codexEfforts)[number];
  readonly baseURL: string;
  readonly toolsURL: string;
  readonly catalogPath: string;
}

const providerName = 'nixie';

export const toolServerName = 'nixie';

// The environment variable that holds the placeholder credential, which the sandbox's grant fills
export const credentialVariable = 'OPENAI_API_KEY';

// The environment variable that holds the step token for nixie's tool route
export const toolTokenVariable = 'NIXIE_TOKEN';

// Features that add a tool, text or traffic that nixie did not ask for. A listed feature that the
// pinned CLI lacks fails its strict config, which the guest's start check catches.
const disabledFeatures = [
  'apps',
  'browser_use',
  'computer_use',
  'daemon_auto_start',
  'fast_mode',
  'goals',
  'guardian_approval',
  'hooks',
  'image_generation',
  'multi_agent',
  'plugins',
  'remote_plugin',
  'shell_snapshot',
  'shell_tool',
  'skill_search',
  'sleep_tool',
  'tool_suggest',
  'ultrafast_mode',
  'unified_exec',
  'view_image',
] as const;

// Builds the Codex home's config.toml. The CLI gets no built-in tool, no command or file write,
// none of its own skills, agents or project docs, and nixie's tool route as its only tool source.
// A tool server that does not answer in 5 s fails the turn, where the CLI's 30 s would hold it.
export function buildCodexConfig(input: CodexConfigInput): string {
  return `${[
    `model = ${JSON.stringify(input.model)}`,
    `model_provider = ${JSON.stringify(providerName)}`,
    `model_reasoning_effort = ${JSON.stringify(input.effort)}`,
    `model_catalog_json = ${JSON.stringify(input.catalogPath)}`,
    'sandbox_mode = "read-only"',
    'approval_policy = "never"',
    'include_environment_context = false',
    'include_permissions_instructions = false',
    'include_apps_instructions = false',
    'include_collaboration_mode_instructions = false',
    'project_doc_max_bytes = 0',
    'web_search = "disabled"',
    `tool_output_token_limit = ${String(toolOutputLimitTokens)}`,
    '',
    `[model_providers.${providerName}]`,
    `name = ${JSON.stringify(providerName)}`,
    `base_url = ${JSON.stringify(input.baseURL)}`,
    `env_key = ${JSON.stringify(credentialVariable)}`,
    'wire_api = "responses"',
    'supports_websockets = false',
    '',
    `[mcp_servers.${toolServerName}]`,
    `url = ${JSON.stringify(input.toolsURL)}`,
    `bearer_token_env_var = ${JSON.stringify(toolTokenVariable)}`,
    'required = true',
    'startup_timeout_sec = 5',
    'default_tools_approval_mode = "approve"',
    '',
    '[tools.experimental_request_user_input]',
    'enabled = false',
    '',
    '[features]',
    ...disabledFeatures.map((feature) => `${feature} = false`),
    '',
    '[skills]',
    'include_instructions = false',
    '',
    '[skills.bundled]',
    'enabled = false',
    '',
    '[agents]',
    'enabled = false',
  ].join('\n')}\n`;
}
