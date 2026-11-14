import { toolOutputLimitTokens } from './tool-output-limit-tokens';

// The CLI counts tokens, and text outside English or full of links comes to under 3 bytes a token,
// so this allows 2 bytes a token, less 4,000 bytes for the rest of the result.
export const recallPageLimitBytes = toolOutputLimitTokens * 2 - 4000;
