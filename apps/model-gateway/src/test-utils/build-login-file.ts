import type { LoginFile } from '../login/login-file-schema';

export function buildLoginFile(overrides: Partial<LoginFile> = {}): LoginFile {
  return {
    version: 1,
    loginID: 'login-1',
    refreshToken: 'refresh-token-1',
    accountID: 'acct-test-1',
    planType: 'plus',
    email: 'owner@example.com',
    status: 'active',
    reason: null,
    statusSince: '2026-11-13T09:12:00.000Z',
    lastRefreshAt: '2026-11-13T09:12:00.000Z',
    ...overrides,
  };
}
