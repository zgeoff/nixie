import { createContext } from 'react';
import type { DeviceFeed } from './create-device-feed';

export const DeviceFeedContext = createContext<DeviceFeed | undefined>(undefined);
