import type { CLIIO, Command, HostTransport } from '../types';

export function createPasskeyCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [
    ['passkey-code', (flags, io) => runPasskeyCode(host, flags.config, io)],
    ['passkeys', (flags, io, args) => runPasskeys(host, { configPath: flags.config, io, args })],
  ];
}

async function runPasskeyCode(host: HostTransport, configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const issued = await host.sendHostRequest(socketPath, 'passkey code', (client) =>
    client.passkeys.issueCode(),
  );

  io.print(`${issued.code}\nThe code works once, until ${issued.expiresAt.toISOString()}.`);

  return 0;
}

interface PasskeysCall {
  readonly configPath: string;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runPasskeys(host: HostTransport, call: PasskeysCall): Promise<number> {
  const [action, passkeyID, ...extra] = call.args;

  if (action === undefined) {
    const socketPath = await host.resolveSocketPath(call.configPath);

    const passkeys = await host.sendHostRequest(socketPath, 'passkey list', (client) =>
      client.passkeys.list(),
    );

    call.io.print(JSON.stringify(passkeys));

    return 0;
  }

  if (action !== 'revoke' || passkeyID === undefined || extra.length > 0) {
    call.io.print('nixie passkeys takes no argument, or revoke and a passkey ID');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.configPath);

  const revoked = await host.sendHostRequest(socketPath, 'passkey revoke', (client) =>
    client.passkeys.revoke({ passkeyID }),
  );

  call.io.print(JSON.stringify(revoked));

  return 0;
}
