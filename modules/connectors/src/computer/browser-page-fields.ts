// The parts of a page result that every browser tool that returns a page shares.
export const browserPageFields = {
  pageNote: [
    ' The page text comes back as parts like web_fetch: pass the page ID to web_fetch with a part ',
    'to read another. Text marked [E4 textbox "Name"] is a control: pass E4 as element to ',
    'computer.browser_fill or computer.browser_click.',
  ].join(''),

  blockedNote: [
    ' When the page is a bot protection’s answer in place of the site’s, the result carries a ',
    'blocked reason; a retry does not pass it.',
  ].join(''),

  pageOutput: {
    type: 'object',
    properties: {
      tab: { type: 'string' },
      url: { type: 'string' },
      status: { type: 'number' },
      title: { type: 'string' },
      page: { type: 'string' },
      part: { type: 'number' },
      parts: { type: 'number' },
      text: { type: 'string' },
      isDiskNew: { type: 'boolean' },
      challenge: { type: 'string' },
      blocked: { type: 'string' },
      refused: { type: 'object' },
    },
    additionalProperties: false,
  },

  pageResults: {
    tab: 'owner_data',
    url: 'untrusted',
    status: 'untrusted',
    title: 'untrusted',
    page: 'untrusted',
    part: 'untrusted',
    parts: 'untrusted',
    text: 'untrusted',
    isDiskNew: 'owner_data',
    challenge: 'owner_data',
    blocked: 'owner_data',
    refused: 'untrusted',
  },
} as const;
