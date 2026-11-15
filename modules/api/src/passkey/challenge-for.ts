import type { ContractInputs } from '@heynixie/contract';

export type ChallengeFor = ContractInputs['passkeys']['challenge']['for'];

export type Assertion = NonNullable<ContractInputs['approvals']['answerProposal']['passkey']>;
