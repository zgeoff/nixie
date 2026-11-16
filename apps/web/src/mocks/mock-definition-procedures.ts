// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

const definitions = mockImplementer.definitions;

export const mockDefinitionProcedures = {
  undo: definitions.undo.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const named = options.input.changeID;

    const changes = store.records
      .all()
      .flatMap((record) =>
        record.definitionNotice === undefined ? [] : [{ record, notice: record.definitionNotice }],
      );

    const target = changes.find(
      (change) => change.notice.changeID === named || change.notice.shortID === named,
    );

    if (target === undefined) {
      throw options.errors.NOT_FOUND();
    }

    const head = changes
      .filter((change) => change.notice.definitionID === target.notice.definitionID)
      .toSorted((left, right) => left.record.sequence - right.record.sequence)
      .at(-1);

    if (head !== undefined && head.record.sequence !== target.record.sequence) {
      throw options.errors.REPLACED({
        data: {
          head: {
            changeID: head.notice.changeID,
            shortID: head.notice.shortID,
            operation: head.notice.operation,
          },
        },
      });
    }

    const changeID = crypto.randomUUID();

    await store.records.update(target.record, {
      data: (draft) => {
        if (draft.definitionNotice !== undefined) {
          draft.definitionNotice.state = 'superseded';
        }
      },
    });

    await store.records.create({
      kind: 'definition.changed',
      thread: 'conversation',
      definitionNotice: {
        changeID,
        definitionID: target.notice.definitionID,
        name: target.notice.name,
        operation: 'undo',
        shortID: changeID.slice(0, 8),
        hasVersion: target.notice.operation !== 'add',
        rendered: null,
        next: null,
        state: 'in_force',
        isUnreadable: false,
      },
    });

    return { definitionID: target.notice.definitionID, changeID };
  }),
};
