import { featureFiles } from './feature-files';

// The features that sign in, send a message and approve what the assistant proposes, which the
// registry lists first.
export const startFeatures = [
  {
    name: 'sign-in-enrol',
    summary: 'Sign a browser in with an enrol code',
    ...featureFiles['sign-in-enrol'],
  },
  {
    name: 'chat-turn',
    summary: 'Send a message, and see the reply after it',
    ...featureFiles['chat-turn'],
  },
  {
    name: 'memory-approval',
    summary: 'Approve a proposed memory',
    ...featureFiles['memory-approval'],
  },
  {
    name: 'policy-proposal',
    summary: 'Approve a call an ask rule held',
    ...featureFiles['policy-proposal'],
  },
  {
    name: 'rule-condition',
    summary: 'Approve a conditional rule, and see it match',
    ...featureFiles['rule-condition'],
  },
];
