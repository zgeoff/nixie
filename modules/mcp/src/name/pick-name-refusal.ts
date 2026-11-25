import { toSDKToolName } from '@heynixie/tools';

const serverToolNamePattern = /^[A-Za-z0-9_-]{1,64}$/u;
const modelNameLimit = 64;

export interface NameCheck {
  readonly serverID: string;

  // the server's name for the tool, before the prefix
  readonly toolName: string;

  // the model names that nixie's own tools and earlier proxied tools hold
  readonly takenModelNames: ReadonlySet<string>;
}

// A proxied tool is named `<serverID>.<tool>`. The model reads the name from toSDKToolName, and the
// proxy keeps the tool hidden, saying why, when the name cannot be one the model reads.
export function pickNameRefusal(check: NameCheck): string | null {
  if (!serverToolNamePattern.test(check.toolName)) {
    return 'the server names the tool outside A-Z, a-z, 0-9, _ and - or past 64 characters';
  }

  const modelName = toSDKToolName(buildProxiedToolName(check.serverID, check.toolName));

  if (modelName.length > modelNameLimit) {
    return `its model name ${modelName} is longer than ${String(modelNameLimit)} characters`;
  }

  if (check.takenModelNames.has(modelName)) {
    return `another tool already holds its model name ${modelName}`;
  }

  return null;
}

export function buildProxiedToolName(serverID: string, toolName: string): string {
  return `${serverID}.${toolName}`;
}
