import { expect, test } from 'bun:test';
import { renderTaskMessageElement } from './render-task-message-element';

test('it opens the element with its attributes and a block ID that its closing tag repeats', () => {
  const element = renderTaskMessageElement(
    [
      ['id', 'k3vq8m2xpa'],
      ['from', 'planner'],
    ],
    ['Halfway.'],
  );

  const blockID = /block="(?<blockID>[0-9a-f]{12})"/u.exec(element)?.groups?.['blockID'];

  expect(element).toBe(
    [
      `<task-message id="k3vq8m2xpa" from="planner" block="${blockID}">`,
      'Halfway.',
      `</task-message block="${blockID}">`,
    ].join('\n'),
  );
});

test('it gives each element a fresh block ID', () => {
  const first = renderTaskMessageElement([], ['Halfway.']);
  const second = renderTaskMessageElement([], ['Halfway.']);

  expect(first).not.toBe(second);
});

test('it escapes a quote and an ampersand in an attribute, so a value cannot end its attribute', () => {
  expect(renderTaskMessageElement([['name', 'Plans & "trips"']], [])).toStartWith(
    '<task-message name="Plans &amp; &quot;trips&quot;" block="',
  );
});
