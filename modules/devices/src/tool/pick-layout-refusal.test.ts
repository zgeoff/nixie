import { expect, test } from 'bun:test';
import type { Device } from '../types';
import { pickLayoutRefusal } from './pick-layout-refusal';

interface Row {
  readonly title: string;
  readonly device: Device | null;
  readonly parsed: Parameters<typeof pickLayoutRefusal>[0]['parsed'];
  readonly isOnline: boolean;
  readonly expected: ReturnType<typeof pickLayoutRefusal>;
}

test.each<Row>([
  {
    title: 'an unknown device before every other fact',
    device: null,
    parsed: { status: 'bad', reason: 'a reason' },
    isOnline: false,
    expected: { code: 'UNKNOWN_DEVICE' },
  },
  {
    title: 'a screen that is off before a bad grid',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    parsed: { status: 'bad', reason: 'a reason' },
    isOnline: false,
    expected: { code: 'SCREEN_OFF' },
  },
  {
    title: 'a bad grid before an offline device, with its reason',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    parsed: { status: 'bad', reason: 'the regions pond and note overlap' },
    isOnline: false,
    expected: { code: 'BAD_LAYOUT', detail: 'the regions pond and note overlap' },
  },
  {
    title: 'an offline device',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    parsed: null,
    isOnline: false,
    expected: { code: 'OFFLINE' },
  },
  {
    title: 'no refusal for an online device with a good grid',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    parsed: {
      status: 'ok',
      layout: {
        columns: ['1fr'],
        rows: ['1fr'],
        regions: [{ name: 'pond', column: 1, row: 1, columnSpan: 1, rowSpan: 1 }],
      },
    },
    isOnline: true,
    expected: null,
  },
])('#pickLayoutRefusal gives $title', (row) => {
  expect(
    pickLayoutRefusal({ device: row.device, parsed: row.parsed, isOnline: row.isOnline }),
  ).toStrictEqual(row.expected);
});
