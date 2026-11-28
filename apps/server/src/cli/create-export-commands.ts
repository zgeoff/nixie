import { resolve } from 'node:path';
import type { CLIIO, Command, HostTransport } from '../types';

export function createExportCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [['export', (flags, io, args) => runExport(host, { configPath: flags.config, io, args })]];
}

interface ExportCall {
  readonly configPath: string;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

// The server writes the file, so the path is made absolute here, against the folder the command
// runs in.
async function runExport(host: HostTransport, call: ExportCall): Promise<number> {
  const [path, ...rest] = call.args;

  if (path === undefined || rest.length > 0) {
    call.io.print('nixie export takes the path of the new file: nixie export <path>');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.configPath);

  const exported = await host.sendHostRequest(socketPath, 'log export', (client) =>
    client.log.export({ path: resolve(path) }),
  );

  call.io.print(
    [
      `nixie wrote ${exported.records} records to ${exported.path}, with each text decrypted.`,
      `${exported.gaps} texts are gaps, because their keys are gone.`,
      'The file holds your whole log in clear text and is readable by its owner only.',
    ].join('\n'),
  );

  return 0;
}
