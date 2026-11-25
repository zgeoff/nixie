import type { DirectResult } from '@heynixie/tools';

const messages: Readonly<Record<string, string>> = {
  UNKNOWN_DEVICE: 'No device of yours has this ID. devices.list names them.',
  SCREEN_OFF: 'The screen of this device is off. Only the device itself switches it on.',
  UNKNOWN_IMAGE: 'No image has this ID.',
  IMAGE_FORGOTTEN: 'The owner forgot this image, so it cannot be shown.',
  OFFLINE: 'The device has no open connection, so nothing can reach its screen now.',
  BAD_LAYOUT: 'The layout is not a grid of regions that fit.',
  NO_LAYOUT: 'The device holds no layout, so there is nothing to save. device.layout sets one.',
  UNKNOWN_REGION:
    'The device has no layout with a region of this name. devices.list shows the layout.',
  PACKAGES_NOT_BUILT:
    'A page cannot load packages yet. Write the page with no packages, using inline script and style.',
  FETCHES_NOT_BUILT: 'A page cannot declare fetches yet. Write the page with no fetches.',
  NOT_A_PAGE: 'This region does not show a page. device.region with kind html puts one there.',
};

// A refusal that changed nothing: the code, and a sentence that says why. A detail replaces the
// code's own sentence.
export function refuseDevice(code: string, detail?: string): DirectResult {
  return {
    result: { refused: code, message: detail ?? messages[code] ?? code },
    refusalCode: code,
  };
}
