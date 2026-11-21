import type { ComputerRequest } from '@heynixie/wire';
import type { BrowserContext, Page } from 'playwright-core';

export interface Tab {
  readonly page: Page;

  // the status of the tab's last navigation
  status: number;
}

export interface BrowserState {
  readonly context: BrowserContext;
  readonly tabs: Map<string, Tab>;
  counter: number;

  // true until the first reply tells the server that the disk started empty
  isDiskNew: boolean;
}

export type OpenLimits = Extract<ComputerRequest, { op: 'open' }>['limits'];
