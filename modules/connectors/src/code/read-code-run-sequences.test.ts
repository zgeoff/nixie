import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { codeRunToolName } from './code-run-tool-name';
import { readCodeRunSequences } from './read-code-run-sequences';

test('it lists only the code calls of the thread, oldest first', async () => {
  const testLog = await startTestLog();

  const definitions = { snapshotHash: 'sha256:test' };

  const written = await writeRecords(testLog.log, [
    {
      kind: 'tool_called',
      definitions,
      thread: 'conversation',
      payload: { callID: 'call-1', runID: 'run-1', toolUseID: null, tool: codeRunToolName },
    },
    {
      kind: 'tool_called',
      definitions,
      thread: 'conversation',
      payload: { callID: 'call-2', runID: 'run-1', toolUseID: null, tool: 'image.draw' },
    },
    {
      kind: 'tool_called',
      definitions,
      thread: 'task-1',
      payload: { callID: 'call-3', runID: 'run-1', toolUseID: null, tool: codeRunToolName },
    },
    {
      kind: 'tool_called',
      definitions,
      thread: 'conversation',
      payload: { callID: 'call-4', runID: 'run-1', toolUseID: null, tool: codeRunToolName },
    },
  ]);

  const sequences = await readCodeRunSequences(testLog.writer.db, 'conversation');

  const first = written.at(0);
  const last = written.at(3);

  invariant(first && last);

  expect(sequences).toStrictEqual([first.sequence, last.sequence]);
});
