import { createShortID } from '@heynixie/db';
import { match } from 'ts-pattern';
import { momentEditedCodec } from './moment-edited-codec';
import type {
  EditMomentRequest,
  MomentCaller,
  MomentChange,
  MomentContext,
  MomentRefusal,
  MomentTables,
  MomentWrite,
} from './moment-types';
import { probeThreadSpan } from './probe-thread-span';
import type { MomentChangeState, PlannedMomentRecord } from './write-moment-change';
import { writeMomentChange } from './write-moment-change';

export function writeMomentEdit(
  context: MomentContext,
  request: EditMomentRequest,
): Promise<MomentWrite> {
  return writeMomentChange(context, request, (state) =>
    planMomentEdit(state, request.caller, request.change),
  );
}

type EditPlan = PlannedMomentRecord | MomentRefusal;

function planMomentEdit(
  state: MomentChangeState,
  caller: MomentCaller,
  change: MomentChange,
): Promise<EditPlan> {
  const buildEdit = (
    edit: Parameters<typeof momentEditedCodec.encode>[0]['change'],
    erasable?: Readonly<Record<string, string>>,
  ): PlannedMomentRecord => ({
    kind: 'moment_edited',
    payload: momentEditedCodec.encode({
      momentID: state.row.moment_id,
      version: state.nextVersion,
      editedBy: caller.kind,
      change: edit,
    }),
    ...(erasable === undefined ? {} : { erasable }),
    ...(edit.kind === 'reflection' ? { reflectionID: edit.reflectionID } : {}),
  });

  return match(change)
    .with({ kind: 'edges' }, async (edges): Promise<EditPlan> => {
      if (caller.kind === 'model' && caller.thread !== state.row.thread) {
        return 'other_thread';
      }

      const isSpan = await probeThreadSpan(state.tx, state.row.thread, edges);

      return isSpan
        ? buildEdit({
            kind: 'edges',
            firstSequence: edges.firstSequence,
            lastSequence: edges.lastSequence,
          })
        : 'bad_span';
    })
    .with({ kind: 'title' }, (title) =>
      Promise.resolve(buildEdit({ kind: 'title' }, { title: title.title })),
    )
    .with({ kind: 'note' }, (note) => {
      const plan: EditPlan =
        caller.kind === 'owner' ? buildEdit({ kind: 'note' }, { note: note.note }) : 'owner_only';

      return Promise.resolve(plan);
    })
    .with({ kind: 'reflection' }, async (reflection): Promise<EditPlan> => {
      if (caller.kind !== 'model') {
        return 'model_only';
      }

      const refusal =
        reflection.reflectionID === undefined
          ? null
          : await readReflectionRefusal(state, reflection.reflectionID, caller.model);

      return (
        refusal ??
        buildEdit(
          {
            kind: 'reflection',
            reflectionID: reflection.reflectionID ?? createShortID(),
            model: caller.model,
          },
          { reflection: reflection.text },
        )
      );
    })
    .with({ kind: 'reflection_removed' }, async (removed): Promise<EditPlan> => {
      if (caller.kind !== 'owner') {
        return 'owner_only';
      }

      const refusal = await readReflectionRefusal(state, removed.reflectionID, null);

      return (
        refusal ?? buildEdit({ kind: 'reflection_removed', reflectionID: removed.reflectionID })
      );
    })
    .exhaustive();
}

// nixie sets a reflection's label from the model on the call's record, so a model edits only a
// reflection whose label holds its own model ID.
async function readReflectionRefusal(
  state: MomentChangeState,
  reflectionID: string,
  model: string | null,
): Promise<MomentRefusal | null> {
  const reflection = await state.tx
    .$extendTables<MomentTables>()
    .selectFrom('moment_reflections')
    .select(['model', 'is_removed'])
    .where('reflection_id', '=', reflectionID)
    .where('moment_id', '=', state.row.moment_id)
    .executeTakeFirst();

  if (reflection === undefined || reflection.is_removed === 1) {
    return 'reflection_not_found';
  }

  return model === null || reflection.model === model ? null : 'not_your_reflection';
}
