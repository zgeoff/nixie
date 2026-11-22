// oxlint-disable zgeoff/file-named-for-export -- TanStack Router builds the route from this file path and its Route export

import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

// The layout of the notebook's pages, which each render their own page inside the signed-in shell.
export const Route = createFileRoute('/notebook')({
  component: Notebook,
});

function Notebook(): ReactNode {
  return <Outlet />;
}
