import type { MomentRefusal } from './moment-types';

// Each sentence holds no moment text, because the tool result record keeps the refusal.
const refusals: Readonly<Record<MomentRefusal, string>> = {
  not_found: 'no moment has that momentID',
  stale: 'the moment changed since the version you read; read it again with moment.read',
  wrong_state: 'the moment is not in a state that change applies to',
  bad_span:
    'firstEventID and lastEventID must both be events of your own thread, the first no later than the last',
  other_thread: 'you keep, or move the edges of, a span of your own thread only',
  memory_writer: 'the memory writer keeps no moments',
  owner_only: 'only the owner writes that, from the client',
  model_only: 'only a model writes a reflection',
  reflection_not_found: 'the moment holds no reflection with that reflectionID',
  not_your_reflection:
    'that reflection is labelled with another model, so you cannot edit it; add a reflection of your own instead',
  item_not_found: 'no active or retired memory item has that itemID',
  already_linked: 'that memory item is already linked to the moment',
  not_linked: 'that memory item is not linked to the moment',
};

export function renderMomentRefusal(reason: MomentRefusal): string {
  return `refused: ${refusals[reason]}`;
}
