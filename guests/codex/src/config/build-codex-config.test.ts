import { expect, test } from 'bun:test';
import { buildCodexConfig } from './build-codex-config';

function setupTest() {
  return {
    buildConfig: () =>
      buildCodexConfig({
        model: 'gpt-test-1',
        effort: 'high',
        baseURL: 'https://models.example.test/v1',
        toolsURL: 'http://127.0.0.1:8901/mcp',
        catalogPath: '/home/nixie/.codex/model-catalog.json',
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

test('it sets no tool output limit', () => {
  const ctx = setupTest();
  const config = ctx.buildConfig();

  expect(config).not.toInclude('tool_output_token_limit');
});
