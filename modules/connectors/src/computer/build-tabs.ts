// the tabs the model may name, each mapped to the guest's tab of the current browser process
export interface ComputerTabs {
  readonly add: (guestTab: string) => string;
  readonly find: (tab: string) => string | null;

  // the tab the model names for a guest's tab, or null when none does
  readonly findGuest: (guestTab: string) => string | null;
  readonly remove: (tab: string) => void;
  readonly isEmpty: () => boolean;
}

export interface TabState {
  readonly tabs: Map<string, string>;
  tabCount: number;
}

export function buildTabs(state: TabState): ComputerTabs {
  return {
    add: (guestTab) => {
      state.tabCount += 1;

      const tab = `t${String(state.tabCount)}`;

      state.tabs.set(tab, guestTab);

      return tab;
    },
    find: (tab) => state.tabs.get(tab) ?? null,
    findGuest: (guestTab) => {
      const named = [...state.tabs].find(([, guest]) => guest === guestTab);

      return named === undefined ? null : named[0];
    },
    remove: (tab) => {
      state.tabs.delete(tab);
    },
    isEmpty: () => state.tabs.size === 0,
  };
}
