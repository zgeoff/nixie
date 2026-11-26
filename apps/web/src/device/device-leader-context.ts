import { createContext } from 'react';
import type { DeviceLeader } from './create-device-leader';

export const DeviceLeaderContext = createContext<DeviceLeader | undefined>(undefined);
