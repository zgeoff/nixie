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

export type LayoutStep =
  | 'set'
  | 'update'
  | 'save'
  | 'change'
  | 'restore'
  | 'preview'
  | 'page'
  | 'message';

// The calls of each step of the device-layout journey. Each call names the device by the ID that
// the list result gave the model.
export function buildLayoutReplies(step: LayoutStep): readonly LayoutReply[] {
  const listing: LayoutReply = { toolUse: { name: 'mcp__nixie__devices_list', input: {} } };

  if (step === 'preview') {
    return [
      listing,
      {
        toolUse: {
          name: 'mcp__nixie__device_preview',
          input: (body: ScriptedBody) => ({ device: getResultID(body, 'shortID') }),
        },
      },
    ];
  }

  if (step === 'page') {
    return [
      listing,
      buildRegionReply('pond', {
        kind: 'html',
        html: "<p id=\"seen\">Waiting</p><script>nixie.onMessage((data) => { document.getElementById('seen').textContent = 'Got ' + data.text; nixie.send('echo', data); });</script>",
      }),
    ];
  }

  if (step === 'message') {
    return [
      listing,
      {
        toolUse: {
          name: 'mcp__nixie__device_sendToPage',
          input: (body: ScriptedBody) => ({
            device: getResultID(body, 'shortID'),
            region: 'pond',
            data: { text: 'hello' },
            retain: true,
          }),
        },
      },
    ];
  }

  if (step === 'update') {
    return [listing, buildRegionReply('note', { kind: 'markdown', markdown: 'Dentist at 3' })];
  }

  if (step === 'save') {
    return [listing, buildSavedLayoutReply('mcp__nixie__device_layout_save')];
  }

  if (step === 'restore') {
    return [listing, buildSavedLayoutReply('mcp__nixie__device_layout_restore')];
  }

  if (step === 'change') {
    return [
      listing,
      {
        toolUse: {
          name: 'mcp__nixie__device_layout',
          input: (body: ScriptedBody) => ({
            device: getResultID(body, 'shortID'),
            columns: ['1fr', '1fr'],
            rows: ['1fr'],
            regions: [
              { name: 'note', column: 1, row: 1 },
              { name: 'garden', column: 2, row: 1, background: 'teal' },
            ],
          }),
        },
      },
      buildRegionReply('garden', { kind: 'markdown', markdown: 'Water the pots' }),
    ];
  }

  return [
    listing,
    {
      toolUse: {
        name: 'mcp__nixie__device_layout',
        input: (body: ScriptedBody) => ({
          device: getResultID(body, 'shortID'),
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
        device: getResultID(body, 'shortID'),
        region,
        content,
        ...(minutes === undefined ? {} : { minutes }),
      }),
    },
  };
}

function buildSavedLayoutReply(name: string): LayoutReply {
  return {
    toolUse: {
      name,
      input: (body: ScriptedBody) => ({
        device: getResultID(body, 'shortID'),
        name: 'evening',
      }),
    },
  };
}
