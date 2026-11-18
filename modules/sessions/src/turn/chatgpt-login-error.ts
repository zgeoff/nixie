import { StepFailedError } from '@heynixie/tasks';

export const chatgptLoginReason = 'model_auth.chatgpt_login';

// A plan profile whose login the gateway does not hold active. A retry fails the same way until the
// operator signs in, so the step waits for its owner.
export class ChatGPTLoginError extends StepFailedError {
  // what the held read of the gateway's logins showed, which never quotes a token or an email
  readonly problem: string;

  constructor(profileID: string, problem: string) {
    super(
      `the turn failed: the plan profile ${profileID} has no usable ChatGPT login: ${problem}. The operator runs model-gateway chatgpt-login for it.`,
      { reason: chatgptLoginReason, isWaitingForOwner: true, records: [] },
    );

    this.name = 'ChatGPTLoginError';
    this.problem = problem;
  }
}
