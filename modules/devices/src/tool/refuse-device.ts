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
  UNKNOWN_PACKAGE:
    'No approved package matches. device.addPackage asks the owner to approve one, and the page names it as name@version.',
  TOO_BIG: 'The package holds more than 5 MiB once unpacked.',
  PACKAGE_KNOWN: 'The owner already approved this version of the package.',
  INTEGRITY_CHANGED:
    'The registry now lists another hash for this version than the one the owner approved, so nothing was installed.',
  BAD_PACKAGE: 'The package was refused, so nothing of it was installed.',
  REGISTRY_UNAVAILABLE: 'The package registry did not answer, so nothing was installed.',
  PACKAGES_UNAVAILABLE: 'This nixie has no fetch sandbox, so it can install no package.',
  FETCHES_UNAVAILABLE: 'This nixie has no fetch sandbox, so a page can declare no fetch.',
  BAD_FETCH:
    'A declared fetch is not a public https URL, or two of them name the same URL. Each URL needs a host that is no address of a private network.',
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
