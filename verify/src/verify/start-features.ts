import { featurePaths } from './feature-paths';

// The features that sign in, send a message and approve what the assistant proposes, which the
// registry lists first.
export const startFeatures = [
  {
    name: 'sign-in-enrol',
    summary: 'Sign a browser in with an enrol code',
    paths: featurePaths['sign-in-enrol'],
  },
  {
    name: 'chat-turn',
    summary: 'Send a message, and see the reply after it',
    paths: featurePaths['chat-turn'],
  },
  {
    name: 'memory-approval',
    summary: 'Approve a proposed memory',
    paths: featurePaths['memory-approval'],
  },
  {
    name: 'policy-proposal',
    summary: 'Approve a call an ask rule held',
    paths: featurePaths['policy-proposal'],
  },
  {
    name: 'rule-condition',
    summary: 'Approve a conditional rule, and see it match',
    paths: featurePaths['rule-condition'],
  },
];
