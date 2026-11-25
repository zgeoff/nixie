export function findTicketLogProblem(log: string, ticket: string): string | null {
  if (log.includes(ticket)) {
    return 'the proxy log holds a bearer ticket';
  }

  return log.includes('REDACTED') ? null : 'the proxy log holds no error line for the requests';
}
