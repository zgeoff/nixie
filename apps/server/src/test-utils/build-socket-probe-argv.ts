export type SocketProbeTarget =
  | { readonly kind: 'tcp'; readonly host: string; readonly port: number }
  | { readonly kind: 'unix'; readonly path: string }
  | { readonly kind: 'abstract'; readonly name: string };

// The argv of a command that tries to connect to each target in order and prints one line for each:
// `open` when the connection was made and `closed` when it was refused or denied.
export function buildSocketProbeArgv(targets: readonly SocketProbeTarget[]): string[] {
  const script = [
    'import json, socket, sys',
    'for target in json.loads(sys.argv[1]):',
    '    if target["kind"] == "tcp":',
    '        family = socket.AF_INET6 if ":" in target["host"] else socket.AF_INET',
    '        address = (target["host"], target["port"])',
    '    elif target["kind"] == "unix":',
    '        family = socket.AF_UNIX',
    '        address = target["path"]',
    '    else:',
    '        family = socket.AF_UNIX',
    String.raw`        address = "\0" + target["name"]`,
    '    probe = socket.socket(family, socket.SOCK_STREAM)',
    '    probe.settimeout(3)',
    '    try:',
    '        probe.connect(address)',
    '        print("open")',
    '    except OSError:',
    '        print("closed")',
    '    finally:',
    '        probe.close()',
  ].join('\n');

  return ['python3', '-c', script, JSON.stringify(targets)];
}
