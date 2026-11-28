import type { ModelCredentialConfig } from '../config/model-credential-config-schema';
import type { ModelCredentialExpiry } from './render-connection-status';

// The model credential's expiry while it falls within the warning time, or null while it is far off
// or the deployment names no expiry. A credential past its expiry still reports it.
export function pickModelCredentialExpiry(
  config: ModelCredentialConfig | undefined,
  nowMs: number,
): ModelCredentialExpiry | null {
  if (config === undefined) {
    return null;
  }

  const expiresAtMs = Date.parse(config.expires_at);

  return expiresAtMs - nowMs <= config.warn_before ? { expiresAtMs } : null;
}
