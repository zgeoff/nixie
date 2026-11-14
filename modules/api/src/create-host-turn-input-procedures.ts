// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { hostImplementer } from './host-implementer';
import type { HostTurnInputs } from './types';

// The group sits on the control socket only. A call reaches a body only through `open`, which
// records the opening first.
export function createHostTurnInputProcedures(turnInputs: HostTurnInputs | undefined) {
  const group = hostImplementer.turnInputs;

  return {
    list: group.list.handler(async (options) => {
      if (turnInputs === undefined) {
        throw options.errors.NOT_CONFIGURED();
      }

      const listed = await turnInputs.list(options.input.limit);

      return {
        inputs: listed.inputs.map((input) => toLoggedInput(input)),
        misses: listed.misses.map((miss) => toInputMiss(miss)),
      };
    }),

    open: group.open.handler(async (options) => {
      if (turnInputs === undefined) {
        throw options.errors.NOT_CONFIGURED();
      }

      const opened = await turnInputs.open(options.input.inputID);

      if (opened.status === 'not_found') {
        throw options.errors.NOT_FOUND();
      }

      if (opened.status === 'removed') {
        throw options.errors.REMOVED();
      }

      if (opened.status === 'not_recorded') {
        throw options.errors.OPEN_NOT_RECORDED();
      }

      return { inputID: opened.inputID, body: Buffer.from(opened.body).toString('base64') };
    }),

    set: group.set.handler(async (options) => {
      if (turnInputs === undefined) {
        throw options.errors.NOT_CONFIGURED();
      }

      const result = await turnInputs.set(options.input);

      if (result.status === 'not_configured') {
        throw options.errors.NOT_CONFIGURED();
      }

      return { state: result.state, until: result.until };
    }),
  };
}

type ListedInputs = Awaited<ReturnType<HostTurnInputs['list']>>;

function toLoggedInput(input: ListedInputs['inputs'][number]) {
  return { ...input, receivedAt: new Date(input.receivedAt), takenAt: new Date(input.takenAt) };
}

function toInputMiss(miss: ListedInputs['misses'][number]) {
  return { ...miss, createdAt: new Date(miss.createdAt) };
}
