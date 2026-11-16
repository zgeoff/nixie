import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { render } from '../test-utils/render';
import { RemovalNotice } from './removal-notice';

test.each([
  ['tool_result', "Removed a tool result (#4190) at nixie's request"],
  ['owner_message', "Removed a message of yours (#4190) at nixie's request"],
  ['model.reply', "Removed a reply (#4190) at nixie's request"],
  ['session_kept', "Removed a record (#4190) at nixie's request"],
])('it names a removed %s in one muted line', (kind, text) => {
  const record = buildMockLogRecord({
    kind: 'action.outcome',
    sequence: 4200,
    removal: { kind, sequence: 4190 },
  });

  const rendered = render(
    <RemovalNotice record={{ ...record, removal: { kind, sequence: 4190 } }} />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(text);
});
