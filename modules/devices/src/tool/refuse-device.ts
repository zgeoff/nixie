import type { DirectResult } from '@heynixie/tools';

const messages: Readonly<Record<string, string>> = {
  UNKNOWN_DEVICE: 'No device of yours has this ID. devices.list names them.',
  SCREEN_OFF: 'The screen of this device is off. Only the device itself switches it on.',
  UNKNOWN_IMAGE: 'No image has this ID.',
  IMAGE_FORGOTTEN: 'The owner forgot this image, so it cannot be shown.',
  OFFLINE: 'The device has no open connection, so nothing can reach its screen now.',
  BAD_LAYOUT: 'The layout is not a grid of regions that fit.',
  UNKNOWN_REGION:
    'The device has no layout with a region of this name. devices.list shows the layout.',
  PAGE_NOT_BUILT: 'A region cannot hold a page yet. Use markdown, an image or a live value.',
};

// A refusal that changed nothing: the code, and a sentence that says why. A detail replaces the
// code's own sentence.
export function refuseDevice(code: string, detail?: string): DirectResult {
  return {
    result: { refused: code, message: detail ?? messages[code] ?? code },
    refusalCode: code,
  };
}
