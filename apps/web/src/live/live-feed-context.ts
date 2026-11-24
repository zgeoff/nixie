import { createContext } from 'react';
import type { LiveFeed } from './create-live-feed';

export const LiveFeedContext = createContext<LiveFeed | undefined>(undefined);
