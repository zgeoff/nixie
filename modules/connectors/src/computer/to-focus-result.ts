import type { JSONObject } from '@heynixie/log';
import type { ComputerFocus } from '@heynixie/wire';
import type { ComputerToolOptions } from './computer-tool-options';

// The focus as the model reads it: a browser tab carries the model's own tab ID. A tab the model
// has not named yet, such as one a page opened, gets the next ID now.
export function toFocusResult(options: ComputerToolOptions, focus: ComputerFocus): JSONObject {
  if (focus.kind !== 'browser') {
    return { kind: focus.kind };
  }

  const tab = options.computer.tabs.findGuest(focus.tab) ?? options.computer.tabs.add(focus.tab);

  return { kind: 'browser', tab, url: focus.url };
}
