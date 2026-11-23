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

  // true while a tool opens a tab, so the tab is not taken for one that a person opened
  isOpening: boolean;

  // true until the first reply tells the server that the disk started empty
  isDiskNew: boolean;
}

// The scans of the guest's scan channel, which every request of Chromium passes
export interface ScanGate {
  readonly scan: (url: string) => Promise<void>;
  readonly scanText: (text: string) => Promise<void>;
}
