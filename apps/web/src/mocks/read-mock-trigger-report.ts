import { mockViewStore } from './mock-view-store';

interface MockTriggerReportInput {
  readonly since: string;
}

export function readMockTriggerReport(input: MockTriggerReportInput) {
  const entries = mockViewStore.reportEntries
    .findMany((query) => query.where((entry) => entry.scheduledFor >= input.since))
    .toSorted((left, right) => right.sequence - left.sequence);

  return { entries: structuredClone(entries) };
}
