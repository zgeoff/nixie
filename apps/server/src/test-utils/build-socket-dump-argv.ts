// The argv of a command that prints, as JSON, the socket links and socket tables of each process
// named `command`, and of itself as a control with a TCP listener and a UDP socket. A process it may
// not read fails the command; a descriptor that closes while it reads, such as its own, is left out.
export function buildSocketDumpArgv(command: string): string[] {
  const script = [
    'import json, os, socket, sys',
    'tables = ["tcp", "tcp6", "udp", "udp6", "unix"]',
    'def link(path):',
    '    try:',
    '        return [os.readlink(path)]',
    '    except FileNotFoundError:',
    '        return []',
    'def dump(pid):',
    '    fds = f"/proc/{pid}/fd"',
    '    links = [target for fd in os.listdir(fds) for target in link(f"{fds}/{fd}")]',
    '    read = lambda name: open(f"/proc/{pid}/net/{name}").read()',
    '    return {"pid": pid, "links": links, "tables": {name: read(name) for name in tables}}',
    'def name(pid):',
    '    try:',
    '        return open(f"/proc/{pid}/comm").read().strip()',
    '    except OSError:',
    '        return ""',
    'pids = sorted(int(pid) for pid in os.listdir("/proc") if pid.isdigit())',
    'matched = [pid for pid in pids if name(pid) == sys.argv[1]]',
    'listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)',
    'listener.bind(("127.0.0.1", 0))',
    'listener.listen()',
    'datagram = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)',
    'datagram.bind(("127.0.0.1", 0))',
    'processes = [dump(pid) for pid in matched]',
    'print(json.dumps({"processes": processes, "control": dump(os.getpid())}))',
  ].join('\n');

  return ['python3', '-c', script, command];
}
