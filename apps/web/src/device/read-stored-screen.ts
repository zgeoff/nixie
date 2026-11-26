const storageKey = 'nixie.device.screen';

// Whether this device left its screen on the last time. The choice stays on the device, and a
// browser that keeps no storage starts every page with the screen off.
export function readStoredScreen(): boolean {
  try {
    return globalThis.localStorage.getItem(storageKey) === 'on';
  } catch {
    return false;
  }
}

export function writeStoredScreen(isOn: boolean): void {
  const value = isOn ? 'on' : 'off';

  try {
    globalThis.localStorage.setItem(storageKey, value);
  } catch {
    // the page works without a stored choice
  }
}

// Whether this device ever stored its choice, which tells a client device that was never switched
// off from a screen device that starts with the screen off.
export function hasStoredScreen(): boolean {
  try {
    return globalThis.localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}
