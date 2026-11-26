import { expect, test } from 'bun:test';
import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';
import { pickShowRefusal } from './pick-show-refusal';
import type { ShowRefusal } from './pick-show-refusal';

interface Row {
  readonly title: string;
  readonly device: Device | null;
  readonly images: ImageState[];
  readonly expected: ShowRefusal | null;
}

test.each<Row>([
  {
    title: 'an unknown device before anything else',
    device: null,
    images: ['missing'],
    expected: 'UNKNOWN_DEVICE',
  },
  {
    title: 'a screen that is off before an image refusal',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['missing'],
    expected: 'SCREEN_OFF',
  },
  {
    title: 'an unknown image before a forgotten one',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['forgotten', 'missing'],
    expected: 'UNKNOWN_IMAGE',
  },
  {
    title: 'a forgotten image after a ready one',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['ok', 'forgotten'],
    expected: 'IMAGE_FORGOTTEN',
  },
  {
    title: 'no refusal for a device with its screen on and its images ready',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: [],
    expected: null,
  },
])('#pickShowRefusal gives $title', (row) => {
  expect(pickShowRefusal({ device: row.device, images: row.images })).toBe(row.expected);
});
