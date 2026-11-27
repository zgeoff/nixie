import type { GoogleToolkit } from '@heynixie/connector-google';
import {
  collectPageParts,
  fitFetchedImage,
  formatLinkTag,
  getPageSession,
  readCodeFile,
  readCodeFileEntry,
  readMessageTimeZone,
  renderLinkedText,
  writeHitLinks,
} from '@heynixie/connectors';

// The reads of the connectors module that the Google tools use, which the adapter takes as a port
// so that it depends on the connections module alone.
export function buildGoogleToolkit(): GoogleToolkit {
  return {
    collectPageParts,
    fitFetchedImage,
    renderLinkedText,
    formatLinkTag,
    writeHitLinks: (log, run, urls) => writeHitLinks(log, getPageSession(run), urls),
    readCodeFile,
    readCodeFileEntry,
    readMessageTimeZone,
  };
}
