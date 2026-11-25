import { expect, test } from 'bun:test';
import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';
import { pickRegionRefusal } from './pick-region-refusal';
import type { RegionRefusal } from './pick-region-refusal';

interface Row {
  readonly title: string;
  readonly device: Device | null;
  readonly isRegionKnown: boolean;
  readonly unbuilt: 'PACKAGES_NOT_BUILT' | 'FETCHES_NOT_BUILT' | null;
  readonly images: ImageState[];
  readonly isOnline: boolean;
  readonly expected: RegionRefusal | null;
}

test.each<Row>([
  {
    title: 'an unknown device before anything else',
    device: null,
    isRegionKnown: false,
    unbuilt: 'PACKAGES_NOT_BUILT',
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
    unbuilt: null,
    images: [],
    isOnline: false,
    expected: 'SCREEN_OFF',
  },
  {
    title: 'an unknown region before packages that are not built',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: false,
    unbuilt: 'PACKAGES_NOT_BUILT',
    images: [],
    isOnline: false,
    expected: 'UNKNOWN_REGION',
  },
  {
    title: 'packages that are not built before an image refusal',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    unbuilt: 'PACKAGES_NOT_BUILT',
    images: ['missing'],
    isOnline: false,
    expected: 'PACKAGES_NOT_BUILT',
  },
  {
    title: 'fetches that are not built',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    unbuilt: 'FETCHES_NOT_BUILT',
    images: [],
    isOnline: true,
    expected: 'FETCHES_NOT_BUILT',
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
    unbuilt: null,
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
    unbuilt: null,
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
    unbuilt: null,
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
    unbuilt: null,
    images: ['ok'],
    isOnline: true,
    expected: null,
  },
])('#pickRegionRefusal gives $title', (row) => {
  expect(
    pickRegionRefusal({
      device: row.device,
      isRegionKnown: row.isRegionKnown,
      unbuilt: row.unbuilt,
      images: row.images,
      isOnline: row.isOnline,
    }),
  ).toBe(row.expected);
});
