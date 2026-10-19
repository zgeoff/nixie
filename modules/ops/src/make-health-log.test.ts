import { expect, mock, test } from 'bun:test';
import { makeHealthLog } from './make-health-log';

test('it logs a part that is unready at its first answer once, with its name and reason', () => {
  const log = mock();
  const recordReport = makeHealthLog(log);

  recordReport('ready', {
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' } },
  });

  recordReport('ready', {
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' } },
  });

  expect(log).toHaveBeenCalledExactlyOnceWith(
    'health.part_unready',
    { probe: 'ready', part: 'imp_host', reason: 'the check took longer than 2000 ms' },
    'warn',
  );
});

test('it logs an unready part again when its reason changes', () => {
  const log = mock();
  const recordReport = makeHealthLog(log);

  recordReport('ready', {
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { imp_host: { isReady: false, reason: 'the part is not checked yet' } },
  });

  recordReport('ready', {
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' } },
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'health.part_unready',
      { probe: 'ready', part: 'imp_host', reason: 'the part is not checked yet' },
      'warn',
    ],
    [
      'health.part_unready',
      { probe: 'ready', part: 'imp_host', reason: 'the check took longer than 2000 ms' },
      'warn',
    ],
  ]);
});

test('it logs a part that turns ready again, by name', () => {
  const log = mock();
  const recordReport = makeHealthLog(log);

  recordReport('ready', {
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { conversation_imp: { isReady: false, reason: 'the runners have not started' } },
  });

  recordReport('ready', {
    status: 'ready',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { conversation_imp: { isReady: true, reason: null } },
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'health.part_unready',
      { probe: 'ready', part: 'conversation_imp', reason: 'the runners have not started' },
      'warn',
    ],
    ['health.part_ready', { probe: 'ready', part: 'conversation_imp' }],
  ]);
});

test('it logs nothing while every part stays ready', () => {
  const log = mock();
  const recordReport = makeHealthLog(log);

  recordReport('live', {
    status: 'ready',
    parts: { process: { isReady: true, reason: null }, database: { isReady: true, reason: null } },
  });

  expect(log).not.toHaveBeenCalled();
});

test('it logs a liveness part apart from the readiness part of the same name', () => {
  const log = mock();
  const recordReport = makeHealthLog(log);

  recordReport('ready', {
    status: 'unready',
    parts: { database: { isReady: false, reason: 'the migrations have not run' } },
  });

  recordReport('live', {
    status: 'unready',
    parts: { database: { isReady: false, reason: 'the check failed: Error' } },
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'health.part_unready',
      { probe: 'ready', part: 'database', reason: 'the migrations have not run' },
      'warn',
    ],
    [
      'health.part_unready',
      { probe: 'live', part: 'database', reason: 'the check failed: Error' },
      'warn',
    ],
  ]);
});

test('it logs a failing advisory part by name', () => {
  const log = mock();
  const recordReport = makeHealthLog(log);

  recordReport('ready', {
    status: 'ready',
    parts: { database: { isReady: true, reason: null } },
    advisory: { conversation_turns: { isReady: false, reason: 'the last 3 turns failed' } },
  });

  expect(log).toHaveBeenCalledExactlyOnceWith(
    'health.part_unready',
    { probe: 'ready', part: 'conversation_turns', reason: 'the last 3 turns failed' },
    'warn',
  );
});
