import type { ScriptedModelRequest } from '@heynixie/testing';
import { getResultID } from './get-result-id';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

export interface LayoutReply {
  readonly toolUse: {
    readonly name: string;
    readonly input:
      | Readonly<Record<string, unknown>>
      | ((body: ScriptedBody) => Readonly<Record<string, unknown>>);
  };
}

// The calls that lay out the first device's screen and fill it, or that update its second region.
// Each call names the device by the ID that the list result gave the model.
export function buildLayoutReplies(step: 'set' | 'update'): readonly LayoutReply[] {
  const listing: LayoutReply = { toolUse: { name: 'mcp__nixie__devices_list', input: {} } };

  if (step === 'update') {
    return [listing, buildRegionReply('note', { kind: 'markdown', markdown: 'Dentist at 3' })];
  }

  return [
    listing,
    {
      toolUse: {
        name: 'mcp__nixie__device_layout',
        input: (body: ScriptedBody) => ({
          device: getResultID(body, 'device'),
          columns: ['1fr', '2fr', '1fr'],
          rows: ['1fr'],
          regions: [
            { name: 'pond', column: 1, row: 1 },
            { name: 'note', column: 2, row: 1 },
            { name: 'clock', column: 3, row: 1 },
          ],
        }),
      },
    },
    buildRegionReply('pond', { kind: 'markdown', markdown: 'Ripples' }, 1),
    buildRegionReply('note', { kind: 'markdown', markdown: 'Bins go out tonight' }),
    buildRegionReply('clock', { kind: 'live', live: 'clock', format: 'HH:mm' }),
  ];
}

function buildRegionReply(region: string, content: object, minutes?: number): LayoutReply {
  return {
    toolUse: {
      name: 'mcp__nixie__device_region',
      input: (body: ScriptedBody) => ({
        device: getResultID(body, 'device'),
        region,
        content,
        ...(minutes === undefined ? {} : { minutes }),
      }),
    },
  };
}
