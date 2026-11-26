export interface ChromePin {
  readonly version: string;
  readonly sha256: string;
}

export function parseChromePin(text: string): ChromePin {
  const value: unknown = JSON.parse(text);

  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'sha256' in value &&
    typeof value.version === 'string' &&
    typeof value.sha256 === 'string' &&
    /^\d+\.\d+\.\d+\.\d+$/u.test(value.version) &&
    /^[0-9a-f]{64}$/u.test(value.sha256)
  ) {
    return { version: value.version, sha256: value.sha256 };
  }

  throw new Error('chrome-pin.json needs a four-part "version" and a 64-digit "sha256"');
}
