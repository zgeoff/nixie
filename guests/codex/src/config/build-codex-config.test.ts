import { expect, test } from 'bun:test';
import { toolOutputLimitTokens } from '@heynixie/wire';
import { buildCodexConfig } from './build-codex-config';

function setupTest() {
  return {
    buildConfig: (toolCallWaitMs: number | null = null) =>
      buildCodexConfig({
        model: 'gpt-test-1',
        effort: 'high',
        baseURL: 'https://models.example.test/v1',
        toolsURL: 'http://127.0.0.1:8901/mcp',
        catalogPath: '/home/nixie/.codex/model-catalog.json',
        toolCallWaitMs,
      }),
  };
}

test('it names the model, its effort and its catalog, and a provider on the profile base URL', () => {
  const ctx = setupTest();
  const config = ctx.buildConfig();

  expect(config.split('\n')).toIncludeAllMembers([
    'model = "gpt-test-1"',
    'model_provider = "nixie"',
    'model_reasoning_effort = "high"',
    'model_catalog_json = "/home/nixie/.codex/model-catalog.json"',
    'base_url = "https://models.example.test/v1"',
    'env_key = "OPENAI_API_KEY"',
    'supports_websockets = false',
  ]);
});

test('it makes nixie the only tool source, over HTTP with the step token, and approves every tool', () => {
  const ctx = setupTest();
  const config = ctx.buildConfig();

  expect(config.split('\n')).toIncludeAllMembers([
    '[mcp_servers.nixie]',
    'url = "http://127.0.0.1:8901/mcp"',
    'bearer_token_env_var = "NIXIE_TOKEN"',
    'required = true',
    'startup_timeout_sec = 5',
    'default_tools_approval_mode = "approve"',
  ]);
});

test('it allows no command and no file write', () => {
  const ctx = setupTest();
  const config = ctx.buildConfig();

  expect(config.split('\n')).toIncludeAllMembers([
    'sandbox_mode = "read-only"',
    'approval_policy = "never"',
    'web_search = "disabled"',
    'shell_tool = false',
    'unified_exec = false',
  ]);
});

test('it turns off the text and the tools that the CLI adds unasked', () => {
  const ctx = setupTest();
  const config = ctx.buildConfig();

  expect(config.split('\n')).toIncludeAllMembers([
    'include_environment_context = false',
    'include_permissions_instructions = false',
    'include_apps_instructions = false',
    'include_collaboration_mode_instructions = false',
    'project_doc_max_bytes = 0',
    '[tools.experimental_request_user_input]',
    'enabled = false',
    '[skills]',
    'include_instructions = false',
    '[agents]',
  ]);
});

test('it sets the tool output limit as a top-level key, before the first table', () => {
  const ctx = setupTest();
  const lines = ctx.buildConfig().split('\n');
  const limitAt = lines.indexOf(`tool_output_token_limit = ${String(toolOutputLimitTokens)}`);
  const firstTableAt = lines.findIndex((line) => line.startsWith('['));

  expect(limitAt).toBeGreaterThan(-1);
  expect(limitAt).toBeLessThan(firstTableAt);
});

test.each([
  [2000, 'tool_timeout_sec = 2'],
  [900_000, 'tool_timeout_sec = 900'],
])('it sets the tool server timeout in seconds from a tool-call wait of %d ms', (waitMs, line) => {
  const ctx = setupTest();
  const lines = ctx.buildConfig(waitMs).split('\n');
  const tableStart = lines.indexOf('[mcp_servers.nixie]');
  const tableEnd = lines.findIndex((entry, index) => index > tableStart && entry.startsWith('['));

  expect(lines.slice(tableStart, tableEnd)).toContain(line);
});

test('it writes no tool server timeout when the tool-call wait is null', () => {
  const ctx = setupTest();

  expect(ctx.buildConfig(null).split('\n')).not.toSatisfyAny((line) =>
    line.startsWith('tool_timeout_sec'),
  );
});
