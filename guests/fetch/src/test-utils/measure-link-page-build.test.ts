import { expect, test } from 'bun:test';
import { measureLinkPageBuild } from './measure-link-page-build';

test('it returns the number of links it built the page with, and the build time per link', () => {
  expect(measureLinkPageBuild(3)).toStrictEqual({ linkCount: 3, nsPerLink: expect.toBeNumber() });
});
