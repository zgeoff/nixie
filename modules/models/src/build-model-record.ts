import type { Definitions, JSONObject, RecordInput, RecordKind } from '@heynixie/log';
import type { ToolRunModel } from '@heynixie/tools';

export interface ModelRecordSource {
  readonly definitions: () => Definitions;

  // the model and the profile the runner started with
  readonly model: ToolRunModel;
}

export interface ModelRecordFields {
  readonly payload: JSONObject;

  // the model's own words, which go in the record's erasable fields
  readonly text?: string;
}

// A record of model output. Its plain payload names the model and the profile in force for the
// call, set by nixie and never taken from anything the model sent.
export function buildModelRecord(
  source: ModelRecordSource,
  kind: RecordKind,
  fields: ModelRecordFields,
): RecordInput {
  return {
    kind,
    definitions: source.definitions(),
    payload: { model: source.model.model, profile: source.model.profile, ...fields.payload },
    ...(fields.text === undefined ? {} : { erasable: { text: fields.text } }),
  };
}
