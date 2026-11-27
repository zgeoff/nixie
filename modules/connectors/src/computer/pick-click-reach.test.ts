import { expect, test } from 'bun:test';
import { pickClickReach } from './pick-click-reach';

test.each([
  [
    'a plain link to another host',
    { role: 'link', href: 'https://other.test/a', isInForm: false, hasClickHandler: false },
    { isPlainLink: true, destinations: ['site.test', 'other.test'] },
  ],
  [
    'a plain link on the tab host',
    { role: 'link', href: 'https://site.test/a', isInForm: false, hasClickHandler: false },
    { isPlainLink: true, destinations: ['site.test'] },
  ],
  [
    'a link with a click handler',
    { role: 'link', href: 'https://other.test/a', isInForm: false, hasClickHandler: true },
    { isPlainLink: false, destinations: ['site.test'] },
  ],
  [
    'a link inside a form',
    { role: 'link', href: 'https://other.test/a', isInForm: true, hasClickHandler: false },
    { isPlainLink: false, destinations: ['site.test'] },
  ],
  [
    'a button',
    { role: 'button', href: null, isInForm: false, hasClickHandler: false },
    { isPlainLink: false, destinations: ['site.test'] },
  ],
])('#pickClickReach reads %s', (_title, element, reach) => {
  expect(pickClickReach(element, 'https://site.test/page')).toStrictEqual(reach);
});

test('#pickClickReach names no tab host for a page that is no web page', () => {
  expect(
    pickClickReach(
      { role: 'button', href: null, isInForm: false, hasClickHandler: false },
      'about:blank',
    ),
  ).toStrictEqual({ isPlainLink: false, destinations: [] });
});
