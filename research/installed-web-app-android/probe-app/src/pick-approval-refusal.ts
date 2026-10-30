import { timingSafeEqual } from 'node:crypto';
import { hashSecret } from './hash-secret.ts';

export interface StoredApproval {
  tokenHash: Buffer;
  sessionToken: string;
  issuedAt: number;
  used: boolean;
}

export interface ApprovalRefusal {
  code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'GONE';
  status: number;
  reason: string;
}

interface ApprovalCheck {
  sessionToken: string | null;
  approval: StoredApproval | undefined;
  token: string;
  nowMs: number;
  lifetimeMs: number;
}

export function pickApprovalRefusal(check: ApprovalCheck): ApprovalRefusal | null {
  if (check.sessionToken === null) {
    return { code: 'UNAUTHORIZED', status: 401, reason: 'no session' };
  }

  if (check.approval === undefined) {
    return { code: 'NOT_FOUND', status: 404, reason: 'unknown approval' };
  }

  if (!timingSafeEqual(hashSecret(check.token), check.approval.tokenHash)) {
    return { code: 'FORBIDDEN', status: 403, reason: 'wrong token' };
  }

  if (check.approval.sessionToken !== check.sessionToken) {
    return { code: 'FORBIDDEN', status: 403, reason: 'another session' };
  }

  if (check.approval.used) {
    return { code: 'CONFLICT', status: 409, reason: 'token already used' };
  }

  if (check.nowMs - check.approval.issuedAt > check.lifetimeMs) {
    return { code: 'GONE', status: 410, reason: 'token expired' };
  }

  return null;
}
