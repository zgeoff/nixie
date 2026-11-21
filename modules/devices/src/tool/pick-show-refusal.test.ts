import { expect, test } from 'bun:test';
import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';
import { pickShowRefusal } from './pick-show-refusal';
import type { ShowRefusal } from './pick-show-refusal';

interface Row {
  readonly title: string;
  readonly device: Device | null;
  readonly images: ImageState[];
  readonly isOnline: boolean;
  readonly expected: ShowRefusal | null;
}

test.each<Row>([
  {
    title: 'an unknown device before anything else',
    device: null,
    images: ['missing'],
    isOnline: false,
    expected: 'UNKNOWN_DEVICE',
  },
  {
    title: 'a screen that is off before an image refusal',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['missing'],
    isOnline: false,
    expected: 'SCREEN_OFF',
  },
  {
    title: 'an unknown image before an offline device',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['forgotten', 'missing'],
    isOnline: false,
    expected: 'UNKNOWN_IMAGE',
  },
  {
    title: 'a forgotten image before an offline device',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['ok', 'forgotten'],
    isOnline: false,
    expected: 'IMAGE_FORGOTTEN',
  },
  {
    title: 'an offline device last',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: ['ok'],
    isOnline: false,
    expected: 'OFFLINE',
  },
  {
    title: 'no refusal for an online device with its screen on',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    images: [],
    isOnline: true,
    expected: null,
  },
])('#pickShowRefusal gives $title', (row) => {
  expect(pickShowRefusal({ device: row.device, images: row.images, isOnline: row.isOnline })).toBe(
    row.expected,
  );
});
