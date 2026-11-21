import type { DirectResult } from '@heynixie/tools';

const messages: Readonly<Record<string, string>> = {
  UNKNOWN_DEVICE: 'No device of yours has this ID. devices.list names them.',
  SCREEN_OFF: 'The screen of this device is off. Only the device itself switches it on.',
  UNKNOWN_IMAGE: 'No image has this ID.',
  IMAGE_FORGOTTEN: 'The owner forgot this image, so it cannot be shown.',
  OFFLINE: 'The device has no open connection, so nothing can reach its screen now.',
};

// A refusal that changed nothing: the code, and a sentence that says why.
export function refuseDevice(code: string): DirectResult {
  return {
    result: { refused: code, message: messages[code] ?? code },
    refusalCode: code,
  };
}
