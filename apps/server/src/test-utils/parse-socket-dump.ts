import { z } from 'zod';

type InetTable = 'tcp' | 'tcp6' | 'udp' | 'udp6';

interface InetSocket {
  readonly table: InetTable;
  readonly local: string;

  // the kernel's state code: 0A is a TCP listener, 07 an unconnected UDP socket
  readonly state: string;
}

// the sockets that one process holds open: each TCP or UDP socket with its local address in the
// kernel's hex form and its state, and the path of each Unix socket that has one
interface OwnedSockets {
  readonly pid: number;
  readonly inet: readonly InetSocket[];
  readonly unixPaths: readonly string[];
}

export interface SocketDump {
  readonly processes: readonly OwnedSockets[];
  readonly control: OwnedSockets;
}

const dumpedProcessSchema = z.object({
  pid: z.number(),
  links: z.string().array(),
  tables: z.object({
    tcp: z.string(),
    tcp6: z.string(),
    udp: z.string(),
    udp6: z.string(),
    unix: z.string(),
  }),
});

const socketDumpSchema = z.object({
  processes: dumpedProcessSchema.array(),
  control: dumpedProcessSchema,
});

// Reads the JSON that the socket dump command prints, and keeps each socket of a table whose inode
// one of the process's links names.
export function parseSocketDump(text: string): SocketDump {
  const dump = socketDumpSchema.parse(JSON.parse(text));

  return {
    processes: dump.processes.map(collectOwned),
    control: collectOwned(dump.control),
  };
}

const inetTables: readonly InetTable[] = ['tcp', 'tcp6', 'udp', 'udp6'];

function collectOwned(process: z.infer<typeof dumpedProcessSchema>): OwnedSockets {
  const inodes = new Set(
    process.links.flatMap(
      (link) => /^socket:\[(?<inode>\d+)\]$/v.exec(link)?.groups?.['inode'] ?? [],
    ),
  );

  return {
    pid: process.pid,
    inet: inetTables.flatMap((table) =>
      collectRows(process.tables[table]).flatMap((columns) =>
        inodes.has(columns[9] ?? '')
          ? [{ table, local: columns[1] ?? '', state: columns[3] ?? '' }]
          : [],
      ),
    ),
    unixPaths: collectRows(process.tables.unix).flatMap((columns) =>
      inodes.has(columns[6] ?? '') && columns[7] !== undefined ? [columns[7]] : [],
    ),
  };
}

// the rows of a table under /proc/net, split into columns, with the header row left out
function collectRows(table: string): string[][] {
  return table
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/v))
    .filter((columns) => columns.length > 1);
}
