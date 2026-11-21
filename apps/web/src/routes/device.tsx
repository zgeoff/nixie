// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DevicePage } from '../device/device-page';

// The page reads nothing before it renders: a device session reaches only its own device calls, so
// the page asks them from the browser.
export const Route = createFileRoute('/device')({ component: DeviceRoute });

function DeviceRoute(): ReactNode {
  return <DevicePage />;
}
