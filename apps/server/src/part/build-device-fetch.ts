import type { ConversationEndpointTools } from '../conversation/start-conversation-endpoint';
import type { WebFetch } from './start-web-fetch';

// What device pages reach the web through, or null while the devices feature is off and the web
// fetch holds no sandbox for them.
type DeviceFetchSource = Pick<
  WebFetch,
  'deviceFetch' | 'packageRegistry' | 'backoff' | 'checkAddress' | 'findSecret' | 'logger'
>;

export function buildDeviceFetch(
  webFetch: DeviceFetchSource,
): ConversationEndpointTools['deviceFetch'] {
  if (webFetch.deviceFetch === null) {
    return null;
  }

  return {
    fetch: webFetch.deviceFetch,
    registry: webFetch.packageRegistry,
    backoff: webFetch.backoff,
    checkAddress: webFetch.checkAddress,
    findSecret: webFetch.findSecret,
    logger: webFetch.logger,
  };
}
