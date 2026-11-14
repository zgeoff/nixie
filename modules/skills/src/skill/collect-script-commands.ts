export interface ScriptCommand {
  readonly path: string;
  readonly line: number;
  readonly kind: 'install' | 'network';
  readonly text: string;
}

const maxTextLength = 160;

export function collectScriptCommands(
  files: ReadonlyMap<string, string>,
): readonly ScriptCommand[] {
  return [...files].flatMap(([path, text]) =>
    text.split('\n').flatMap((lineText, index) => {
      const kind = pickCommandKind(lineText);

      if (kind === null) {
        return [];
      }

      const trimmed = lineText.trim();

      return [
        {
          path,
          line: index + 1,
          kind,
          text: trimmed.length > maxTextLength ? `${trimmed.slice(0, maxTextLength)}…` : trimmed,
        },
      ];
    }),
  );
}

const installPatterns: readonly RegExp[] = [
  /\b(?:pip3?|uv\s+pip|python3?\s+-m\s+pip)\s+install\b/iu,
  /\buv\s+(?:add|tool\s+install)\b/iu,
  /\b(?:uvx|pipx|npx|bunx|pnpx)\b/iu,
  /\b(?:npm|pnpm)\s+(?:install|i|add|ci)\b/iu,
  /\byarn\s+(?:add|install|dlx)\b/iu,
  /\b(?:bun|deno)\s+(?:add|install|i|x)\b/iu,
  /\b(?:gem|cargo|go|brew|conda|mamba|poetry|composer)\s+(?:install|add|get|require)\b/iu,
  /\b(?:apt|apt-get|apk|dnf|yum|zypper)\s+(?:install|add)\b/iu,
  /\bpacman\s+-S/u,
];

const networkPatterns: readonly RegExp[] = [
  /\b(?:curl|wget|ncat|netcat|ssh|scp|sftp|rsync|telnet)\b/iu,
  /\bgit\s+(?:clone|fetch|pull|push|ls-remote)\b/iu,
  /\b(?:requests|httpx|aiohttp)\.\w+\(/u,
  /\burllib\.request\b|\burlopen\(|\bhttp\.client\b|\bsmtplib\b|\bftplib\b/u,
  /\bsocket\.(?:socket|create_connection)\b/u,
  /\bfetch\(|\bXMLHttpRequest\b|\bWebSocket\(|\baxios\b/u,
  /['"](?:node:)?(?:https?|net|tls|dgram)['"]/u,
  /\bInvoke-(?:WebRequest|RestMethod)\b/iu,
  /\bdocker\s+(?:pull|run)\b/iu,
];

function pickCommandKind(line: string): ScriptCommand['kind'] | null {
  if (installPatterns.some((pattern) => pattern.test(line))) {
    return 'install';
  }

  return networkPatterns.some((pattern) => pattern.test(line)) ? 'network' : null;
}
