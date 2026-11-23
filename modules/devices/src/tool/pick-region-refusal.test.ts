import { expect, test } from 'bun:test';
import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';
import { pickRegionRefusal } from './pick-region-refusal';
import type { RegionRefusal } from './pick-region-refusal';

interface Row {
  readonly title: string;
  readonly device: Device | null;
  readonly isRegionKnown: boolean;
  readonly isPage: boolean;
  readonly images: ImageState[];
  readonly isOnline: boolean;
  readonly expected: RegionRefusal | null;
}

test.each<Row>([
  {
    title: 'an unknown device before anything else',
    device: null,
    isRegionKnown: false,
    isPage: true,
    images: ['missing'],
    isOnline: false,
    expected: 'UNKNOWN_DEVICE',
  },
  {
    title: 'a screen that is off before an unknown region',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: false,
    isPage: false,
    images: [],
    isOnline: false,
    expected: 'SCREEN_OFF',
  },
  {
    title: 'an unknown region before a page',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: false,
    isPage: true,
    images: [],
    isOnline: false,
    expected: 'UNKNOWN_REGION',
  },
  {
    title: 'a page before an image refusal',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    isPage: true,
    images: ['missing'],
    isOnline: false,
    expected: 'PAGE_NOT_BUILT',
  },
  {
    title: 'a missing image before a forgotten one',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    isPage: false,
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
    isRegionKnown: true,
    isPage: false,
    images: ['forgotten'],
    isOnline: false,
    expected: 'IMAGE_FORGOTTEN',
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
    isRegionKnown: true,
    isPage: false,
    images: ['ok'],
    isOnline: false,
    expected: 'OFFLINE',
  },
  {
    title: 'no refusal for an online device with a known region and good content',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    isPage: false,
    images: ['ok'],
    isOnline: true,
    expected: null,
  },
])('#pickRegionRefusal gives $title', (row) => {
  expect(
    pickRegionRefusal({
      device: row.device,
      isRegionKnown: row.isRegionKnown,
      isPage: row.isPage,
      images: row.images,
      isOnline: row.isOnline,
    }),
  ).toBe(row.expected);
});
