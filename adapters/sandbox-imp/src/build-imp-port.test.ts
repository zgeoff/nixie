import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { buildImpPort } from './build-imp-port';
import { startStubImpd } from './test-utils/start-stub-impd';

test('it refuses to read the features of an impd whose version the client does not speak', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '0.39.0', features: {}, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).rejects.toThrow(/^impd 0\.39\.0 does not speak imp client /u);
});

test('it reads the features of an impd of major 3 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '3.0.0',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of an impd of major 4 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '4.0.0',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the features of an impd of major 5 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '5.0.0',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it refuses to read the features of an impd of major 6 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '6.0.0', features: {}, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).rejects.toThrow(/^impd 6\.0\.0 does not speak imp client 4\./u);
});

test('it refuses to read the features of an impd of major 1 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '1.6.0', features: {}, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).rejects.toThrow(/^impd 1\.6\.0 does not speak imp client 4\./u);
});

test('it reads the features of an impd of major 2 with imp client 4', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        version: '2.0.3',
        features: { publicEgress: true, backupOptOut: true },
        egress: { isEnforced: true },
      },
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: true,
    hasBackupOptOut: true,
  });
});

test('it reads the backup opt-out among the features of an impd that has it', () => {
  const answerRequest = mock(() =>
    Response.json({ json: { version: '2.0.0', features: { backupOptOut: true }, egress: {} } }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readFeatures()).resolves.toMatchObject({ hasBackupOptOut: true });
});

test('it ends a feature read that impd never answers at the abort, after one call', async () => {
  const answer = mock(() => Promise.withResolvers<Response>().promise);
  const impd = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answer });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  const stopped = new AbortController();

  const read = port.readFeatures(stopped.signal);

  await waitForCondition(() => answer.mock.calls.length === 1);

  stopped.abort();

  expect(read).rejects.toMatchObject({ name: 'AbortError' });
  expect(answer).toHaveBeenCalledOnce();
});

test('it reads an imp that impd shows with no backup flag as backed up', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        id: '01a130ab-7d6b-7664-ae89-f93646cd7e2a',
        name: 'nixie-a',
        image: 'conversation',
        state: 'running',
        vcpus: 1,
        memoryMib: 512,
        diskMib: 1024,
        ip: '10.0.0.2',
        slot: 2,
        port: 2222,
        httpPort: 8080,
        url: 'https://nixie-a.imps.example',
        createdAt: '2026-10-12T05:10:00.428Z',
        lastActiveAt: '2026-10-12T05:10:00.428Z',
        cpu: { limit: null, weight: 100 },
      },
      meta: [
        [1, 'createdAt'],
        [1, 'lastActiveAt'],
      ],
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readImpBackup('nixie-a')).resolves.toBeTrue();
});

test('it reads an imp created with backup off as left out of the backups', () => {
  const answerRequest = mock(() =>
    Response.json({
      json: {
        id: '01a130ab-7d6b-7664-ae89-f93646cd7e2a',
        name: 'nixie-a',
        image: 'conversation',
        state: 'running',
        vcpus: 1,
        memoryMib: 512,
        diskMib: 1024,
        backup: false,
        ip: '10.0.0.2',
        slot: 2,
        port: 2222,
        httpPort: 8080,
        url: 'https://nixie-a.imps.example',
        createdAt: '2026-10-12T05:10:00.428Z',
        lastActiveAt: '2026-10-12T05:10:00.428Z',
        cpu: { limit: null, weight: 100 },
      },
      meta: [
        [1, 'createdAt'],
        [1, 'lastActiveAt'],
      ],
    }),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readImpBackup('nixie-a')).resolves.toBeFalse();
});

test('it reads no backup flag for an imp that impd does not hold', () => {
  const refuseRequest = mock(() =>
    Response.json(
      { json: { defined: false, code: 'NOT_FOUND', status: 404, message: 'no imp nixie-a' } },
      { status: 404 },
    ),
  );

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: refuseRequest,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  expect(port.readImpBackup('nixie-a')).resolves.toBeNull();
});

test("it fails a wake that impd refuses for memory with impd's code and message", () => {
  const url = startStubImpd({
    code: 'RAM_BUDGET_EXCEEDED',
    status: 503,
    message: 'Not enough RAM budget, even after sleeping idle imps',
    data: { budgetMib: 8192, usedMib: 7680, requestedMib: 1024 },
  });

  const port = buildImpPort({ url, token: 'not-a-real-token' });

  expect(port.wakeImp('nixie-a')).rejects.toMatchObject({
    name: 'SandboxHostError',
    call: 'wake',
    code: 'RAM_BUDGET_EXCEEDED',
    hostMessage: 'Not enough RAM budget, even after sleeping idle imps',
    message:
      'the sandbox host failed the wake with RAM_BUDGET_EXCEEDED: Not enough RAM budget, even after sleeping idle imps',
  });
});

test("it fails a create that impd refuses with impd's code and message", () => {
  const url = startStubImpd({
    code: 'PRECONDITION_FAILED',
    status: 412,
    message: 'Not possible on this host',
  });

  const port = buildImpPort({ url, token: 'not-a-real-token' });

  expect(
    port.createImp({
      name: 'nixie-a',
      image: 'nixie-guest',
      vcpus: 1,
      memoryMib: 1024,
      diskMib: 4096,
      policy: { mode: 'none', allow: [] },
      backup: false,
    }),
  ).rejects.toMatchObject({
    name: 'SandboxHostError',
    call: 'create',
    code: 'PRECONDITION_FAILED',
    hostMessage: 'Not possible on this host',
  });
});

test('it passes on a failed wake that is no impd error, such as impd not answering', async () => {
  const answerProbe = mock(() => new Response());
  const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answerProbe });
  const url = probe.url.href;

  await probe.stop(true);

  const port = buildImpPort({ url, token: 'not-a-real-token' });

  expect(port.wakeImp('nixie-a')).rejects.toMatchObject({
    name: 'TypeError',
    code: 'ECONNREFUSED',
  });
});

test('it adds a secret as the custom kind with no field beyond its name, value and rules', async () => {
  const bodies: unknown[] = [];

  const recordBody = mock(async (request: Request) => {
    const body: unknown = await request.json();

    bodies.push(body);

    return Response.json({ json: null });
  });

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: recordBody,
  });

  onTestFinished(() => impd.stop(true));

  const port = buildImpPort({ url: impd.url.href, token: 'not-a-real-token' });

  await port.addSecret({
    name: 'model-key',
    value: 'sk-not-a-real-key',
    host: 'api.example.com',
    header: 'x-api-key',
    scheme: 'raw',
  });

  expect(bodies).toStrictEqual([
    {
      json: {
        name: 'model-key',
        kind: 'custom',
        value: 'sk-not-a-real-key',
        rules: [{ host: 'api.example.com', header: 'x-api-key', scheme: 'raw' }],
      },
    },
  ]);
});
