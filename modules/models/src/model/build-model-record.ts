import type {
  Definitions,
  ErasableRecordKind,
  JSONObject,
  RecordCodec,
  RecordInput,
  RecordKind,
} from '@heynixie/log';
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

  readonly message?: string;
}

export function buildModelRecord<
  Kind extends ErasableRecordKind,
  Payload extends ModelFields & JSONObject,
>(
  source: ModelRecordSource,
  codec: RecordCodec<Kind, Payload, unknown>,
  fields: ModelRecordFields<Payload>,
): RecordInput {
  const erasable = {
    ...(fields.text === undefined ? {} : { text: fields.text }),
    ...(fields.summary === undefined ? {} : { summary: fields.summary }),
    ...(fields.message === undefined ? {} : { message: fields.message }),
  };

  return {
    kind: codec.kind,
    definitions: source.definitions(),
    payload: codec.parse(buildModelPayload(source, fields.payload)),
    ...(Object.keys(erasable).length === 0 ? {} : { erasable }),
  };
}

export function buildModelEventRecord<
  Kind extends Exclude<RecordKind, ErasableRecordKind>,
  Payload extends ModelFields & JSONObject,
>(
  source: ModelRecordSource,
  codec: RecordCodec<Kind, Payload, unknown>,
  payload: Omit<Payload, keyof ModelFields>,
): RecordInput {
  return {
    kind: codec.kind,
    definitions: source.definitions(),
    payload: codec.parse(buildModelPayload(source, payload)),
  };
}

function buildModelPayload(source: ModelRecordSource, payload: object): object {
  return { ...payload, model: source.model.model, profile: source.model.profile };
}
