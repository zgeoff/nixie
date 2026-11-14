import { expect, test } from 'bun:test';
import { renderShapeFault } from './render-shape-fault';

test('it names the keyword and the path of a keyword the check cannot enforce, with the keywords it takes', () => {
  expect(renderShapeFault({ fault: 'keyword', path: 'code', keyword: 'pattern' })).toStartWith(
    'the report shape uses pattern at code, which nixie cannot enforce, so nixie started nothing. A report shape takes only type, description,',
  );
});

test('it names the top level for a fault with no path', () => {
  expect(renderShapeFault({ fault: 'value', path: '', keyword: 'properties' })).toBe(
    'the report shape has a properties at the top level that nixie cannot read, so nixie started nothing',
  );
});

test('it names the required field that the properties lack', () => {
  expect(renderShapeFault({ fault: 'required', path: 'stops[]', name: 'city' })).toBe(
    'the report shape requires city at stops[], which its properties lack, so no report could match, and nixie started nothing',
  );
});

test('it gives the size of a shape that is too long beside the most', () => {
  expect(renderShapeFault({ fault: 'size', size: 5200, max: 4000 })).toBe(
    'the report shape is 5200 characters and the most is 4000, so nixie started nothing',
  );
});
