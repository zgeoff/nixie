import type { ReactNode } from 'react';
import { useLiveConnection } from './use-live-connection';
import { useShownBeat } from './use-shown-beat';

// Keeps the tab's live stream open and sends the visible client's beat while a signed-in page
// shows.
export function LiveConnection(): ReactNode {
  useLiveConnection();
  useShownBeat();

  return null;
}
