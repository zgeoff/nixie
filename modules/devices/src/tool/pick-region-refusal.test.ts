import { expect, test } from 'bun:test';
import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';
import { pickRegionRefusal } from './pick-region-refusal';
import type { PageFault, RegionRefusal } from './pick-region-refusal';

interface Row {
  readonly title: string;
  readonly device: Device | null;
  readonly isRegionKnown: boolean;
  readonly pageFault: PageFault | null;
  readonly images: ImageState[];
  readonly isOnline: boolean;
  readonly expected: RegionRefusal | null;
}

test.each<Row>([
  {
    title: 'an unknown device before anything else',
    device: null,
    isRegionKnown: false,
    pageFault: 'UNKNOWN_PACKAGE',
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
      deviceKind: 'screen',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: false,
    pageFault: null,
    images: [],
    isOnline: false,
    expected: 'SCREEN_OFF',
  },
  {
    title: 'an unknown region before a package that nobody approved',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: false,
    pageFault: 'UNKNOWN_PACKAGE',
    images: [],
    isOnline: false,
    expected: 'UNKNOWN_REGION',
  },
  {
    title: 'a package that nobody approved before an image refusal',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    pageFault: 'UNKNOWN_PACKAGE',
    images: ['missing'],
    isOnline: false,
    expected: 'UNKNOWN_PACKAGE',
  },
  {
    title: 'a fetch that the page cannot declare',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    pageFault: 'BAD_FETCH',
    images: [],
    isOnline: true,
    expected: 'BAD_FETCH',
  },
  {
    title: 'a missing image before a forgotten one',
    device: {
      deviceID: 'dk4m7q2w9x',
      identityID: 'an-identity',
      name: 'desk panel',
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    pageFault: null,
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
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    pageFault: null,
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
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    pageFault: null,
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
      deviceKind: 'screen',
      capabilities: { screen: true, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
    isRegionKnown: true,
    pageFault: null,
    images: ['ok'],
    isOnline: true,
    expected: null,
  },
])('#pickRegionRefusal gives $title', (row) => {
  expect(
    pickRegionRefusal({
      device: row.device,
      isRegionKnown: row.isRegionKnown,
      pageFault: row.pageFault,
      images: row.images,
      isOnline: row.isOnline,
    }),
  ).toBe(row.expected);
});
