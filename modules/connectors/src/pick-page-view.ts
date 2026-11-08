import type { ToolOutcome } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { collectPageMatches } from './collect-page-matches';
import type { PageView } from './parse-web-fetch-request';
import type { StoredPage } from './write-web-fetch-page';

export function pickPageView(page: StoredPage, view: PageView): ToolOutcome {
  const partCount = formatPartCount(page.parts.length);

  return match(view)
    .with({ kind: 'part' }, (partView): ToolOutcome => {
      const text = page.parts[partView.part - 1];

      return text === undefined
        ? {
            status: 'error',
            message: `page ${page.pageID} has ${partCount}, so it has no part ${partView.part}`,
          }
        : { status: 'ok', result: buildPageResult(page, partView.part, text) };
    })
    .with({ kind: 'find' }, (findView): ToolOutcome => {
      const matches = collectPageMatches(page.parts, findView.query);
      const [first] = matches;
      const text = first === undefined ? undefined : page.parts[first.part - 1];

      return first === undefined || text === undefined
        ? { status: 'error', message: `0 matches in ${partCount} of page ${page.pageID}` }
        : {
            status: 'ok',
            result: {
              ...buildPageResult(page, first.part, text),
              matches,
            },
          };
    })
    .exhaustive();
}

function formatPartCount(count: number): string {
  return count === 1 ? '1 part' : `${count} parts`;
}

function buildPageResult(page: StoredPage, part: number, text: string) {
  return {
    url: page.url,
    status: page.status,
    contentType: page.contentType,
    page: page.pageID,
    part,
    parts: page.parts.length,
    text,
    isTruncated: page.isTruncated,
    blocked: page.blocked,
  };
}
