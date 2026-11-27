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
import type { GoogleToolkit } from '../gmail/types';

// The Google tools' toolkit over the connectors module's own reads, as the server fills it.
export function buildTestToolkit(): GoogleToolkit {
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
