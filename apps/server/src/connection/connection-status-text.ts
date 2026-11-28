// The sentences of the connection status line, with {{ slot }} places that hold only names, statuses,
// times and counts. The text sits here, apart from the code that fills it, so a change to the
// client's reconnect place changes one line.
export const connectionStatusText = {
  reconnectPlace: 'Settings → Connections',

  statusIntro: 'Connections that need attention:',

  statusLine:
    '- {{ connector }} connection "{{ label }}"{{ account }}: {{ status }}{{ reason }} since {{ since }}; last success {{ lastSuccess }}.{{ removed }} Reconnect it in {{ place }}.',

  noSuccess: 'none yet',

  removedTools: ' Calls to these tools stop: {{ tools }}.',
  removedToolsMore: ' Calls to these tools stop: {{ tools }}, and {{ count }} more.',

  modelCredentialLine:
    '- The model credential: expiring on {{ endsAt }}. Reconnect it in {{ place }}.',

  statusRule: [
    'Tell the owner about a connection that needs attention when a request needs it, or when they ask.',
    'Tell the owner about a break that has lasted a long time once, at a natural moment, when an event says so.',
    'Mention an expiry only when it falls within the time a request covers, or when the owner asks. The model credential is the exception: when the entry lists it, tell the owner once, unprompted.',
    'Say each of these once per session.',
  ].join('\n'),

  changedLine:
    'The {{ connector }} connection "{{ label }}"{{ account }} is now {{ status }}{{ reason }}. Last success {{ lastSuccess }}.{{ removed }} Reconnect it in {{ place }}.',

  returnedLine:
    'The {{ connector }} connection "{{ label }}"{{ account }} is active again. {{ failed }}{{ runs }}',

  lastedLine:
    'The {{ connector }} connection "{{ label }}"{{ account }} has been broken since {{ since }}. Tell the owner once, at a natural moment.',

  accountPart: ' ({{ account }})',

  noCallFailed: 'No call failed during the break.',
  oneCallFailed: '1 call failed during the break.',
  manyCallsFailed: '{{ count }} calls failed during the break.',
  oneRunWithout: ' 1 job run ran without it.',
  manyRunsWithout: ' {{ count }} job runs ran without it.',

  statusNames: {
    needs_consent: 'needs consent',
    failing: 'failing',
    expiring: 'expiring',
  },
} as const;
