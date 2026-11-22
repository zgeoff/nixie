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
