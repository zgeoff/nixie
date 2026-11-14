import { match } from 'ts-pattern';
import { maxReportShapeCharacters, reportShapeKeywords } from './check-report-shape';
import type { ShapeFault } from './types';

const shapeFaultSentences = {
  keyword:
    'the report shape uses {keyword} at {path}, which nixie cannot enforce, so nixie started nothing. A report shape takes only {keywords}.',
  value:
    'the report shape has a {keyword} at {path} that nixie cannot read, so nixie started nothing',
  required:
    'the report shape requires {name} at {path}, which its properties lack, so no report could match, and nixie started nothing',
  size: 'the report shape is {n} characters and the most is {max}, so nixie started nothing',
} as const;

// The fault names a keyword or a path that the model chose, which the sentence repeats to the same
// model in the call's own result.
export function renderShapeFault(fault: ShapeFault): string {
  return match(fault)
    .with({ fault: 'keyword' }, (found) =>
      shapeFaultSentences.keyword
        .replace('{keyword}', () => found.keyword)
        .replace('{path}', () => renderPath(found.path))
        .replace('{keywords}', () => reportShapeKeywords.join(', ')),
    )
    .with({ fault: 'value' }, (found) =>
      shapeFaultSentences.value
        .replace('{keyword}', () => found.keyword)
        .replace('{path}', () => renderPath(found.path)),
    )
    .with({ fault: 'required' }, (found) =>
      shapeFaultSentences.required
        .replace('{name}', () => found.name)
        .replace('{path}', () => renderPath(found.path)),
    )
    .with({ fault: 'size' }, (found) =>
      shapeFaultSentences.size
        .replace('{n}', String(found.size))
        .replace('{max}', String(maxReportShapeCharacters)),
    )
    .exhaustive();
}

function renderPath(path: string): string {
  return path === '' ? 'the top level' : path;
}
