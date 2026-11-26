// The state of every MCP sign-in starts with this. Google's states are base64url text, which holds no
// dot, so the shared OAuth return route tells the two apart by it.
export const mcpSignInStatePrefix = 'mcp.';
