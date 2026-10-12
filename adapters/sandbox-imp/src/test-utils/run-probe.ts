import type { Sandbox } from '@heynixie/sandbox';

interface ProbeOptions {
  readonly viaBroker: boolean;
}

// Runs curl in the guest and returns its HTTP status and exit code as `status=<code> exit=<code>`.
// Without the broker, curl skips every proxy, so the connection is the guest's own; with it, curl
// goes through the proxy that the guest's env names.
export async function runProbe(
  sandbox: Pick<Sandbox, 'exec'>,
  url: string,
  options: ProbeOptions,
): Promise<string> {
  const proxy = options.viaBroker ? '' : '--noproxy "*"';
  const result = await sandbox.exec({
    argv: [
      'sh',
      '-c',
      `curl -sS -m 5 ${proxy} -o /dev/null -w "status=%{http_code}" "${url}"; echo " exit=$?"`,
    ],
  });

  return new TextDecoder().decode(result.stdout.bytes).trim();
}
