const toolsByScope: Readonly<Record<string, string>> = {
  'gmail.modify': 'every gmail tool',
  'calendar.events': 'every calendar tool except calendar.list_calendars',
  'calendar.calendarlist.readonly': 'calendar.list_calendars',
  'drive.file': 'every drive tool and the Drive picker',
};

// What a missing scope holds back, in words. An unknown scope holds back nothing the page names.
export function findHeldBackTools(scope: string): string | null {
  return toolsByScope[scope] ?? null;
}
