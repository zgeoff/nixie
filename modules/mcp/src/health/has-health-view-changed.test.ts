import { expect, test } from 'bun:test';
import { hasHealthViewChanged } from './has-health-view-changed';
import type { ServerHealth } from './types';

function setupTest() {
  const unhealthy: ServerHealth = {
    failures: 3,
    nextTryAtMs: 1000,
    lastError: 'timeout',
    hasPassed: false,
    isUnhealthy: true,
  };

  const healthy: ServerHealth = {
    failures: 0,
    nextTryAtMs: null,
    lastError: null,
    hasPassed: true,
    isUnhealthy: false,
  };

  return { unhealthy, healthy, hasChanged: hasHealthViewChanged };
}

test('it finds the page view changed when a server becomes unhealthy', () => {
  const ctx = setupTest();

  expect(ctx.hasChanged(ctx.healthy, ctx.unhealthy)).toBe(true);
});

test('it finds the page view changed when a server recovers', () => {
  const ctx = setupTest();

  expect(ctx.hasChanged(ctx.unhealthy, ctx.healthy)).toBe(true);
});

test('it finds the page view changed when an unhealthy server gets a later next try', () => {
  const ctx = setupTest();

  expect(ctx.hasChanged(ctx.unhealthy, { ...ctx.unhealthy, failures: 4, nextTryAtMs: 2000 })).toBe(
    true,
  );
});

test('it finds the page view changed when an unhealthy server gets another error', () => {
  const ctx = setupTest();

  expect(ctx.hasChanged(ctx.unhealthy, { ...ctx.unhealthy, lastError: 'refused' })).toBe(true);
});

test('it finds the page view unchanged when a healthy server fails once', () => {
  const ctx = setupTest();

  expect(
    ctx.hasChanged(ctx.healthy, {
      ...ctx.healthy,
      failures: 1,
      nextTryAtMs: 500,
      lastError: 'timeout',
    }),
  ).toBe(false);
});

test('it finds the page view unchanged when an unhealthy server stays as it was', () => {
  const ctx = setupTest();

  expect(ctx.hasChanged(ctx.unhealthy, { ...ctx.unhealthy })).toBe(false);
});
