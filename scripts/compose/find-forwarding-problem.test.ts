import { expect, test } from 'bun:test';
import { findForwardingProblem } from './find-forwarding-problem.ts';

test('#findForwardingProblem accepts the protocol and host that the proxy was sent', () => {
  expect(findForwardingProblem('proto=https host=nixie.example')).toBeNull();
});

test('#findForwardingProblem reports a protocol that the proxy reset', () => {
  expect(findForwardingProblem('proto=http host=nixie.example')).toBe(
    'the proxy changed the forwarded protocol or host: proto=http host=nixie.example',
  );
});
