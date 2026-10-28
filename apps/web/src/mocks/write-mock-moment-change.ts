import type { ContractInputs } from '@heynixie/contract';
import { match } from 'ts-pattern';
import { store } from './store';

type MomentChange =
  | ContractInputs['memory']['editMoment']['change']
  | { readonly kind: 'link'; readonly itemID: string; readonly isLinked: boolean }
  | { readonly kind: 'destroy' };

interface MomentChangeInput {
  readonly clientActionID: string;
  readonly momentID: string;
  readonly version: number;
  readonly change: MomentChange;
}

type MomentChangeResult =
  | { readonly status: 'applied' }
  | {
      readonly status:
        | 'reused'
        | 'not_found'
        | 'stale'
        | 'bad_span'
        | 'reflection_not_found'
        | 'item_not_found'
        | 'already_linked'
        | 'not_linked';
    };

export async function writeMockMomentChange(input: MomentChangeInput): Promise<MomentChangeResult> {
  const bound = JSON.stringify([input.momentID, input.version, input.change]);

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return { status: earlier.input === bound ? 'applied' : 'reused' };
  }

  const moment = store.moments.findFirst((query) =>
    query.where(
      (candidate) => candidate.momentID === input.momentID || candidate.shortID === input.momentID,
    ),
  );

  if (moment === undefined || moment.state === 'destroyed') {
    return { status: 'not_found' };
  }

  if (moment.version !== input.version) {
    return { status: 'stale' };
  }

  const refusal = readRefusal(moment, input.change);

  if (refusal !== null) {
    return { status: refusal };
  }

  await applyChange(moment, input.change);

  await store.memoryActions.create({ clientActionID: input.clientActionID, input: bound });

  return { status: 'applied' };
}

type MockMoment = NonNullable<ReturnType<typeof store.moments.findFirst>>;

type Refusal = Exclude<MomentChangeResult['status'], 'applied' | 'reused'>;

function readRefusal(moment: MockMoment, change: MomentChange): Refusal | null {
  return match(change)
    .with({ kind: 'edges' }, (edges) => {
      const bounds = [edges.firstSequence, edges.lastSequence].map((sequence) =>
        store.records.findFirst((query) => query.where({ sequence, thread: moment.thread })),
      );

      return edges.firstSequence > edges.lastSequence || bounds.includes(undefined)
        ? 'bad_span'
        : null;
    })
    .with({ kind: 'reflection_removed' }, (removed) =>
      moment.reflections.some((reflection) => reflection.reflectionID === removed.reflectionID)
        ? null
        : 'reflection_not_found',
    )
    .with({ kind: 'link' }, (link) => {
      const item = readItem(link.itemID);

      if (item === undefined) {
        return 'item_not_found';
      }

      const isLinked = moment.linkedItemIDs.includes(item.itemID);

      if (link.isLinked) {
        return isLinked ? 'already_linked' : null;
      }

      return isLinked ? null : 'not_linked';
    })
    .with({ kind: 'title' }, { kind: 'note' }, { kind: 'destroy' }, () => null)
    .exhaustive();
}

function readItem(itemID: string) {
  return store.memoryItems.findFirst((query) =>
    query.where(
      (item) =>
        (item.itemID === itemID || item.shortID === itemID) &&
        (item.state === 'active' || item.state === 'retired'),
    ),
  );
}

async function applyChange(moment: MockMoment, change: MomentChange): Promise<void> {
  const now = new Date();

  await store.moments.update(moment, {
    data(draft) {
      draft.version += 1;
      draft.editedAt = now;

      match(change)
        .with({ kind: 'title' }, (title) => {
          draft.title = title.title;
          draft.titleBy = 'owner';
        })
        .with({ kind: 'edges' }, (edges) => {
          draft.firstSequence = edges.firstSequence;
          draft.lastSequence = edges.lastSequence;
        })
        .with({ kind: 'note' }, (note) => {
          draft.note = { text: note.note, writtenAt: now };
        })
        .with({ kind: 'reflection_removed' }, (removed) => {
          draft.reflections = draft.reflections.filter(
            (reflection) => reflection.reflectionID !== removed.reflectionID,
          );
        })
        .with({ kind: 'link' }, (link) => {
          const itemID = readItem(link.itemID)?.itemID ?? link.itemID;

          draft.linkedItemIDs = link.isLinked
            ? [...draft.linkedItemIDs, itemID]
            : draft.linkedItemIDs.filter((linked) => linked !== itemID);
        })
        .with({ kind: 'destroy' }, () => {
          draft.state = 'destroyed';
        })
        .exhaustive();
    },
  });
}
