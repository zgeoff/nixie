import { momentRetiredCodec } from './moment-retired-codec';
import type {
  MomentContext,
  MomentRefusal,
  MomentWrite,
  RetireMomentRequest,
} from './moment-types';
import type { MomentChangeState, PlannedMomentRecord } from './write-moment-change';
import { writeMomentChange } from './write-moment-change';

export function writeMomentRetirement(
  context: MomentContext,
  request: RetireMomentRequest,
): Promise<MomentWrite> {
  return writeMomentChange(context, request, (state) => {
    const plan = planRetirement(state, request.isRetired);

    return Promise.resolve(plan);
  });
}

function planRetirement(
  state: MomentChangeState,
  isRetired: boolean,
): PlannedMomentRecord | MomentRefusal {
  const fromState = isRetired ? 'active' : 'retired';

  if (state.row.state !== fromState) {
    return 'wrong_state';
  }

  return {
    kind: 'moment_retired',
    payload: momentRetiredCodec.encode({
      momentID: state.row.moment_id,
      version: state.nextVersion,
      isRetired,
    }),
  };
}
