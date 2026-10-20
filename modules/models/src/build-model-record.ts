import type { Definitions, JSONObject, RecordCodec, RecordInput, RecordKind } from '@heynixie/log';
import type { ToolRunModel } from '@heynixie/tools';

export interface ModelRecordSource {
  readonly definitions: () => Definitions;

  // the model and the profile the runner started with
  readonly model: ToolRunModel;
}

interface ModelFields {
  readonly model: string;
  readonly profile: string;
}

export interface ModelRecordFields<Payload> {
  readonly payload: Omit<Payload, keyof ModelFields>;

  // the model's own words, which go in the record's erasable fields
  readonly text?: string;

  // the summary of the model's reasoning, erasable beside the text, so a forget removes it too
  readonly summary?: string;
}

// A record of model output, encoded through its kind's codec. Its plain payload names the model and
// the profile in force for the call, set by nixie and never taken from anything the model sent.
export function buildModelRecord<Kind extends RecordKind, Payload extends ModelFields & JSONObject>(
  source: ModelRecordSource,
  codec: RecordCodec<Kind, Payload, unknown>,
  fields: ModelRecordFields<Payload>,
): RecordInput {
  const payload = { ...fields.payload, model: source.model.model, profile: source.model.profile };

  const erasable = {
    ...(fields.text === undefined ? {} : { text: fields.text }),
    ...(fields.summary === undefined ? {} : { summary: fields.summary }),
  };

  return {
    kind: codec.kind,
    definitions: source.definitions(),
    payload: codec.parse(payload),
    ...(Object.keys(erasable).length === 0 ? {} : { erasable }),
  };
}
