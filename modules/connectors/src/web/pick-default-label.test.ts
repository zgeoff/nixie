import { expect, test } from 'bun:test';
import { pickDefaultLabel } from './pick-default-label';

test('it labels a connection with the account name that its connector reports', () => {
  const report = {
    grantedScopes: ['gmail.modify'],
    accountName: 'robin.vale@example.com',
    missing: [],
  };

  expect(pickDefaultLabel({ connectorID: 'google', report, takenLabels: [] })).toBe(
    'robin.vale@example.com',
  );
});

test('it labels a connection with the connector ID when its connector reports no account name', () => {
  const report = { grantedScopes: [], accountName: null, missing: [] };

  expect(pickDefaultLabel({ connectorID: 'kagi', report, takenLabels: [] })).toBe('kagi');
});

test('it labels a connection with the connector ID when the account name is blank', () => {
  expect(
    pickDefaultLabel({
      connectorID: 'kagi',
      report: { grantedScopes: [], missing: [], accountName: '   ' },
      takenLabels: [],
    }),
  ).toBe('kagi');
});

test('it trims the account name', () => {
  expect(
    pickDefaultLabel({
      connectorID: 'google',
      report: { grantedScopes: [], missing: [], accountName: ' robin.vale@example.com\n' },
      takenLabels: [],
    }),
  ).toBe('robin.vale@example.com');
});

test('it numbers the label from 2 when another connection of the connector holds it', () => {
  expect(
    pickDefaultLabel({
      connectorID: 'kagi',
      report: { grantedScopes: [], missing: [], accountName: null },
      takenLabels: ['kagi'],
    }),
  ).toBe('kagi 2');
});

test('it takes the lowest free number when numbered labels are held', () => {
  expect(
    pickDefaultLabel({
      connectorID: 'kagi',
      report: { grantedScopes: [], missing: [], accountName: null },
      takenLabels: ['kagi', 'kagi 2', 'kagi 4'],
    }),
  ).toBe('kagi 3');
});

test('it treats a held label as taken after trimming, in NFC and ignoring case', () => {
  const composed = `jos${String.fromCodePoint(0xe9)}@example.org`;
  const decomposed = ` JOSE${String.fromCodePoint(0x03_01)}@EXAMPLE.ORG `;

  expect(
    pickDefaultLabel({
      connectorID: 'google',
      report: { grantedScopes: [], missing: [], accountName: composed },
      takenLabels: [decomposed],
    }),
  ).toBe(`${composed} 2`);
});
