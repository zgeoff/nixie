export function findForwardingProblem(answer: string): string | null {
  return answer === 'proto=https host=nixie.example'
    ? null
    : `the proxy changed the forwarded protocol or host: ${answer}`;
}
