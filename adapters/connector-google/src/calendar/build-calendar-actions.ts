import type { ConnectorAction, Reconcile } from '@heynixie/connections';
import type { GoogleDeps } from '../types';
import { buildCalendarCancelTool } from './build-calendar-cancel-tool';
import { buildCalendarChangeTool } from './build-calendar-change-tool';
import { buildCalendarCreateTool } from './build-calendar-create-tool';
import { buildCalendarListCalendarsTool } from './build-calendar-list-calendars-tool';
import { buildCalendarListEventsTool } from './build-calendar-list-events-tool';
import { buildCalendarReadEventTool } from './build-calendar-read-event-tool';
import { buildCalendarRespondTool } from './build-calendar-respond-tool';
import { calendarCheckName, calendarEventsScope, calendarListScope } from './calendar-tool-names';
import { checkCalendarChange } from './check-calendar-change';
import { runCalendarCancel } from './run-calendar-cancel';
import { runCalendarChange } from './run-calendar-change';
import { runCalendarCreate } from './run-calendar-create';
import { runCalendarRespond } from './run-calendar-respond';

// A write is checked no sooner than 5 minutes after its attempt began. A write that sends asks the
// owner when the check finds nothing, because a repeated email to a guest is worse than one
// question. A write that emails no one tries again.
const askReconcile: Reconcile = {
  kind: 'check',
  tool: calendarCheckName,
  trustNegativeAfterMs: 300_000,
  onNotFound: 'ask',
};

const retryReconcile: Reconcile = { ...askReconcile, onNotFound: 'retry' };

// The Calendar tools as actions of the Google connector. The reads need calendar.events, except the
// list of calendars, which needs its own scope. Each create, change, cancel and response runs
// queued.
export function buildCalendarActions(deps: GoogleDeps): ConnectorAction[] {
  const reads = [buildCalendarListEventsTool(deps), buildCalendarReadEventTool(deps)].map(
    (tool): ConnectorAction => ({
      tool,
      scopes: [calendarEventsScope],
      reconcile: { kind: 'none' },
    }),
  );

  return [
    {
      tool: buildCalendarListCalendarsTool(deps),
      scopes: [calendarListScope],
      reconcile: { kind: 'none' },
    },
    ...reads,
    {
      tool: buildCalendarCreateTool(deps, false),
      scopes: [calendarEventsScope],
      reconcile: retryReconcile,
      queued: {
        reconcile: retryReconcile,
        run: (attempt) => runCalendarCreate(deps, false, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
    {
      tool: buildCalendarCreateTool(deps, true),
      scopes: [calendarEventsScope],
      reconcile: askReconcile,
      queued: {
        reconcile: askReconcile,
        run: (attempt) => runCalendarCreate(deps, true, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
    {
      tool: buildCalendarChangeTool(deps, false),
      scopes: [calendarEventsScope],
      reconcile: retryReconcile,
      queued: {
        reconcile: retryReconcile,
        run: (attempt) => runCalendarChange(deps, false, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
    {
      tool: buildCalendarChangeTool(deps, true),
      scopes: [calendarEventsScope],
      reconcile: askReconcile,
      queued: {
        reconcile: askReconcile,
        run: (attempt) => runCalendarChange(deps, true, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
    {
      tool: buildCalendarCancelTool(deps, false),
      scopes: [calendarEventsScope],
      reconcile: retryReconcile,
      queued: {
        reconcile: retryReconcile,
        run: (attempt) => runCalendarCancel(deps, false, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
    {
      tool: buildCalendarCancelTool(deps, true),
      scopes: [calendarEventsScope],
      reconcile: askReconcile,
      queued: {
        reconcile: askReconcile,
        run: (attempt) => runCalendarCancel(deps, true, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
    {
      tool: buildCalendarRespondTool(deps),
      scopes: [calendarEventsScope],
      reconcile: askReconcile,
      queued: {
        reconcile: askReconcile,
        run: (attempt) => runCalendarRespond(deps, attempt),
        check: (attempt) => checkCalendarChange(deps, attempt),
      },
    },
  ];
}
