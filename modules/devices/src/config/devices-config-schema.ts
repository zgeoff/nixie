import { z } from 'zod';

// The config section of the devices feature. An empty section turns the feature on, and it takes no
// field yet. A config without it offers no device tool, page or device scope.
export const devicesConfigSchema = z.strictObject({});
