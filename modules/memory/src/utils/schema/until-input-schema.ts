export const untilInputSchema = {
  type: 'string',
  pattern: String.raw`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$`,
  description:
    'when the fact stops being true: an ISO time with an offset, such as ' +
    '2026-10-19T23:59:59+01:00',
};
