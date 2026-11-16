import type { Sandbox } from '@heynixie/sandbox';

interface ProbeOptions {
  readonly viaBroker: boolean;
  readonly apiKey?: string;
}

export async function runProbe(
  sandbox: Pick<Sandbox, 'exec'>,
  url: string,
  options: ProbeOptions,
): Promise<string> {
  const proxy = options.viaBroker ? '' : '--noproxy "*"';
  const header = options.apiKey === undefined ? '' : `-H "x-api-key: ${options.apiKey}"`;

  const result = await sandbox.exec({
    argv: [
      'sh',
      '-c',
      `curl -sS -m 5 ${proxy} ${header} -o /dev/null -w "status=%{http_code}" "${url}"; echo " exit=$?"`,
    ],
  });

  return new TextDecoder().decode(result.stdout.bytes).trim();
}
