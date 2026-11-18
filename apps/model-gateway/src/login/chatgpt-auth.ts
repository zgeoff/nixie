// The endpoints and the client ID of the Codex CLI at version 0.166.0, which the codex image pins:
// codex-rs/login/src/auth/manager.rs, device_code_auth.rs and server.rs. The gateway holds them as
// constants, so no config key or environment value can point the refresh token elsewhere.
export const chatgptAuth = {
  issuer: 'https://auth.openai.com',
  clientID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  deviceCodeURL: 'https://auth.openai.com/api/accounts/deviceauth/usercode',
  deviceTokenURL: 'https://auth.openai.com/api/accounts/deviceauth/token',

  // where the operator enters the code
  deviceVerificationURL: 'https://auth.openai.com/codex/device',
  tokenURL: 'https://auth.openai.com/oauth/token',
  deviceRedirectURI: 'https://auth.openai.com/deviceauth/callback',
  deviceCodeLifetimeMs: 15 * 60 * 1000,
  requestTimeoutMs: 10_000,
} as const;

// the one call the login and the refresh make, which tests answer with their own function
export type AuthFetch = (url: string, init: RequestInit) => Promise<Response>;
