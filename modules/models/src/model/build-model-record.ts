import type { Definitions, JSONObject, RecordCodec, RecordInput, RecordKind } from '@heynixie/log';
import type { ToolRunModel } from '@heynixie/tools';

export interface ModelRecordSource {
  readonly definitions: () => Definitions;

  readonly model: ToolRunModel;
}

interface ModelFields {
  readonly model: string;
  readonly profile: string;
}

export interface ModelRecordFields<Payload> {
  readonly payload: Omit<Payload, keyof ModelFields>;

  readonly text?: string;

  readonly summary?: string;
}

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
