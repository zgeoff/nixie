// One Agent SDK turn with the conversation guest's own options, for a memory sample.
// PROMPT_FILE holds the prompt, MCP_URL turns the stub tool server on, RESUME resumes a session,
// and CLAUDE_BIN points a compiled build at the CLI binary, which it can't find from its own path.
import { query } from '@anthropic-ai/claude-agent-sdk';

const startedAtMs = Date.now();
const promptFile = process.env['PROMPT_FILE'];
const toolServerURL = process.env['MCP_URL'];
const resumeID = process.env['RESUME'];
const cliPath = process.env['CLAUDE_BIN'];

const session = query({
  prompt:
    promptFile === undefined
      ? 'Write three short sentences about tide pools.'
      : await Bun.file(promptFile).text(),
  options: {
    tools: [],
    ...(toolServerURL === undefined
      ? { allowedTools: [], maxTurns: 1, mcpServers: {} }
      : {
          allowedTools: ['mcp__stub'],
          mcpServers: { stub: { type: 'http', url: toolServerURL, alwaysLoad: true } },
        }),
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    skills: [],
    settings: {
      disableBundledSkills: true,
      autoMemoryEnabled: false,
      autoDreamEnabled: false,
      autoCompactEnabled: false,
    },
    systemPrompt: { type: 'custom', prompt: 'You are a terse assistant.', snapshot: false },
    // A compiled build's import.meta.dir is a path inside the binary, where the CLI can't start.
    cwd: process.cwd(),
    ...(cliPath === undefined ? {} : { pathToClaudeCodeExecutable: cliPath }),
    env: { ...process.env, CLAUDE_CONFIG_DIR: `${process.cwd()}/.claude-config` },
    ...(resumeID === undefined ? {} : { resume: resumeID, forkSession: true }),
  },
});

for await (const message of session) {
  if (message.type === 'result') {
    console.log(
      JSON.stringify({
        subtype: message.subtype,
        sessionID: message.session_id,
        inputTokens:
          message.usage.input_tokens +
          (message.usage.cache_read_input_tokens ?? 0) +
          (message.usage.cache_creation_input_tokens ?? 0),
        elapsedMs: Date.now() - startedAtMs,
      }),
    );
  }
}
