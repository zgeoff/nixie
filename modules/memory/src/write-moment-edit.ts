import { createShortID } from '@heynixie/db';
import { P, match } from 'ts-pattern';
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
import type { WriteInTransaction } from './types';
import type { MomentChangeState, PlannedMomentRecord } from './write-moment-change';
import { writeMomentChange } from './write-moment-change';

export function writeMomentEdit(
  context: MomentContext,
  request: EditMomentRequest,
  writeInTransaction?: WriteInTransaction,
): Promise<MomentWrite> {
  return writeMomentChange(
    context,
    request,
    async (state) => {
      const facts = await readEditFacts(state, request.change);

      return buildEditPlan(state, facts, request.caller, request.change);
    },
    writeInTransaction,
  );
}

interface EditFacts {
  readonly isSpan: boolean;
  readonly reflection: { readonly model: string; readonly isRemoved: boolean } | null;
  readonly newReflectionID: string;
}

async function readEditFacts(state: MomentChangeState, change: MomentChange): Promise<EditFacts> {
  const isSpan =
    change.kind === 'edges' ? await probeThreadSpan(state.tx, state.row.thread, change) : false;

  const reflectionID = match(change)
    .with({ kind: 'reflection' }, (edit) => edit.reflectionID ?? null)
    .with({ kind: 'reflection_removed' }, (removed) => removed.reflectionID)
    .with({ kind: P.union('edges', 'title', 'note') }, () => null)
    .exhaustive();

  const reflection = reflectionID === null ? null : await readReflection(state, reflectionID);

  return { isSpan, reflection, newReflectionID: createShortID() };
}

async function readReflection(
  state: MomentChangeState,
  reflectionID: string,
): Promise<EditFacts['reflection']> {
  const reflection = await state.tx
    .$extendTables<MomentTables>()
    .selectFrom('moment_reflections')
    .select(['model', 'is_removed'])
    .where('reflection_id', '=', reflectionID)
    .where('moment_id', '=', state.row.moment_id)
    .executeTakeFirst();

  return reflection === undefined
    ? null
    : { model: reflection.model, isRemoved: reflection.is_removed === 1 };
}

type EditPlan = PlannedMomentRecord | MomentRefusal;

function buildEditPlan(
  state: Pick<MomentChangeState, 'row' | 'nextVersion'>,
  facts: EditFacts,
  caller: MomentCaller,
  change: MomentChange,
): EditPlan {
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
    .with({ kind: 'edges' }, (edges): EditPlan => {
      if (caller.kind === 'model' && caller.thread !== state.row.thread) {
        return 'other_thread';
      }

      return facts.isSpan
        ? buildEdit({
            kind: 'edges',
            firstSequence: edges.firstSequence,
            lastSequence: edges.lastSequence,
          })
        : 'bad_span';
    })
    .with({ kind: 'title' }, (title) => buildEdit({ kind: 'title' }, { title: title.title }))
    .with({ kind: 'note' }, (note) =>
      caller.kind === 'owner' ? buildEdit({ kind: 'note' }, { note: note.note }) : 'owner_only',
    )
    .with({ kind: 'reflection' }, (reflection): EditPlan => {
      if (caller.kind !== 'model') {
        return 'model_only';
      }

      const refusal =
        reflection.reflectionID === undefined
          ? null
          : pickReflectionRefusal(facts.reflection, caller.model);

      return (
        refusal ??
        buildEdit(
          {
            kind: 'reflection',
            reflectionID: reflection.reflectionID ?? facts.newReflectionID,
            model: caller.model,
          },
          { reflection: reflection.text },
        )
      );
    })
    .with({ kind: 'reflection_removed' }, (removed): EditPlan => {
      if (caller.kind !== 'owner') {
        return 'owner_only';
      }

      return (
        pickReflectionRefusal(facts.reflection, null) ??
        buildEdit({ kind: 'reflection_removed', reflectionID: removed.reflectionID })
      );
    })
    .exhaustive();
}

// nixie sets a reflection's label from the model on the call's record, so a model edits only a
// reflection whose label holds its own model ID.
function pickReflectionRefusal(
  reflection: EditFacts['reflection'],
  model: string | null,
): MomentRefusal | null {
  if (reflection === null || reflection.isRemoved) {
    return 'reflection_not_found';
  }

  return model === null || reflection.model === model ? null : 'not_your_reflection';
}
