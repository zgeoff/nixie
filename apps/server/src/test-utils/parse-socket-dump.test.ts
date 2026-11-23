import { expect, test } from 'bun:test';
import { parseSocketDump } from './parse-socket-dump';

test('it keeps the TCP listener, the bound UDP socket and the Unix socket that a process holds', () => {
  const text = JSON.stringify({
    processes: [
      {
        pid: 41,
        links: ['/dev/null', 'socket:[7001]', 'socket:[7002]', 'socket:[7003]', 'pipe:[9]'],
        tables: {
          tcp: [
            '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
            '   0: 00000000:170C 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 7001 1 0000000000000000 100 0 0 10 0',
          ].join('\n'),
          tcp6: '  sl  local_address remote_address st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
          udp: [
            '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops',
            ' 5901: 00000000:14E9 00000000:0000 07 00000000:00000000 00:00000000 00000000     0        0 7002 2 0000000000000000 0',
          ].join('\n'),
          udp6: '  sl  local_address remote_address st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops',
          unix: [
            'Num       RefCount Protocol Flags    Type St Inode Path',
            '000000000656255b: 00000002 00000000 00010000 0001 01 7003 /run/vnc/vnc.sock',
          ].join('\n'),
        },
      },
    ],
    control: { pid: 42, links: [], tables: { tcp: '', tcp6: '', udp: '', udp6: '', unix: '' } },
  });

  expect(parseSocketDump(text)).toStrictEqual({
    processes: [
      {
        pid: 41,
        inet: [
          { table: 'tcp', local: '00000000:170C', state: '0A' },
          { table: 'udp', local: '00000000:14E9', state: '07' },
        ],
        unixPaths: ['/run/vnc/vnc.sock'],
      },
    ],
    control: { pid: 42, inet: [], unixPaths: [] },
  });
});

test('it leaves out the sockets of a table that the process holds no link to', () => {
  const text = JSON.stringify({
    processes: [],
    control: {
      pid: 42,
      links: ['socket:[8001]'],
      tables: {
        tcp: [
          '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
          '   0: 0100007F:170C 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 7001 1 0000000000000000 100 0 0 10 0',
        ].join('\n'),
        tcp6: '',
        udp: '',
        udp6: '',
        unix: [
          'Num       RefCount Protocol Flags    Type St Inode Path',
          '000000000656255b: 00000002 00000000 00000000 0001 03 7003',
        ].join('\n'),
      },
    },
  });

  expect(parseSocketDump(text).control).toStrictEqual({ pid: 42, inet: [], unixPaths: [] });
});
