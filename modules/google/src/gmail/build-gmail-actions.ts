import type { ConnectorAction, Reconcile } from '@heynixie/connections';
import { buildGmailLabelTool } from './build-gmail-label-tool';
import { buildGmailReadAttachmentTool } from './build-gmail-read-attachment-tool';
import { buildGmailReadTool } from './build-gmail-read-tool';
import { buildGmailReplyTool } from './build-gmail-reply-tool';
import { buildGmailSearchTool } from './build-gmail-search-tool';
import { buildGmailSendDraftTool } from './build-gmail-send-draft-tool';
import { buildGmailSendTool } from './build-gmail-send-tool';
import { buildGmailWakeCancelTool } from './build-gmail-wake-cancel-tool';
import { buildGmailWakeListTool } from './build-gmail-wake-list-tool';
import { buildGmailWakeSetTool } from './build-gmail-wake-set-tool';
import { checkGmailDraft } from './check-gmail-draft';
import { checkGmailLabels } from './check-gmail-labels';
import { checkGmailSent } from './check-gmail-sent';
import { gmailCheckNames, gmailScope, gmailToolNames } from './gmail-tool-names';
import type { OutgoingTool } from './plan-outgoing-mail';
import { runGmailLabel } from './run-gmail-label';
import { runGmailSend } from './run-gmail-send';
import { runGmailWakeSet } from './run-gmail-wake-set';
import type { GmailDeps } from './types';

// A send that may have gone out is checked in the Sent folder no sooner than 5 minutes after its
// attempt began. A check that finds nothing brings the action to the owner and never sends again.
const sentReconcile: Reconcile = {
  kind: 'check',
  tool: gmailCheckNames.sent,
  trustNegativeAfterMs: 300_000,
  onNotFound: 'ask',
};

const labelReconcile: Reconcile = {
  kind: 'check',
  tool: gmailCheckNames.labels,
  onNotFound: 'retry',
};

const draftReconcile: Reconcile = {
  kind: 'check',
  tool: gmailCheckNames.draft,
  onNotFound: 'retry',
};

// A rule that was set again with the same match and target replaces itself, so only the owner can
// say whether a rule of unknown outcome stands.
const wakeSetReconcile: Reconcile = { kind: 'none' };

// The Gmail tools as actions of the Google connector, each needing the scope gmail.modify. The
// reads and the wake list and cancel run in the turn; the label, the draft, the sends and the wake
// rule run queued.
export function buildGmailActions(deps: GmailDeps): ConnectorAction[] {
  const reads = [
    buildGmailSearchTool(deps),
    buildGmailReadTool(deps),
    buildGmailReadAttachmentTool(deps),
    buildGmailWakeListTool(deps),
    buildGmailWakeCancelTool(deps),
  ].map((tool): ConnectorAction => ({
    tool,
    scopes: [gmailScope],
    reconcile: { kind: 'none' },
  }));

  const sends = [
    buildGmailSendTool(deps, 'send'),
    buildGmailReplyTool(deps),
    buildGmailSendDraftTool(deps),
  ].map((tool): ConnectorAction => ({
    tool,
    scopes: [gmailScope],
    reconcile: sentReconcile,
    queued: {
      reconcile: sentReconcile,
      run: (attempt) => runGmailSend(deps, pickSendTool(tool.name), attempt),
      check: (attempt) => checkGmailSent(deps, attempt),
    },
  }));

  return [
    ...reads,
    {
      tool: buildGmailLabelTool(deps),
      scopes: [gmailScope],
      reconcile: labelReconcile,
      queued: {
        reconcile: labelReconcile,
        run: (attempt) => runGmailLabel(deps, attempt),
        check: (attempt) => checkGmailLabels(deps, attempt),
      },
    },
    {
      tool: buildGmailSendTool(deps, 'draft'),
      scopes: [gmailScope],
      reconcile: draftReconcile,
      queued: {
        reconcile: draftReconcile,
        run: (attempt) => runGmailSend(deps, gmailToolNames.draft, attempt),
        check: (attempt) => checkGmailDraft(deps, attempt),
      },
    },
    {
      tool: buildGmailWakeSetTool(deps),
      scopes: [gmailScope],
      reconcile: wakeSetReconcile,
      queued: {
        reconcile: wakeSetReconcile,
        run: (attempt) => runGmailWakeSet(deps, attempt),
      },
    },
    ...sends,
  ];
}

function pickSendTool(name: string): OutgoingTool {
  if (name === gmailToolNames.reply) {
    return gmailToolNames.reply;
  }

  return name === gmailToolNames.sendDraft ? gmailToolNames.sendDraft : gmailToolNames.send;
}
