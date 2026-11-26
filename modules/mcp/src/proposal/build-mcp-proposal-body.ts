import type { McpToolOverride } from '@heynixie/policy';
import type { ProposalBody } from '@heynixie/proposals';
import { buildToolDeclaration } from '../declaration/build-tool-declaration';
import { formatCanonicalJSON } from '../pin/format-canonical-json';
import type { McpOperation, ToolForm } from '../types';

// The forms an allow card shows: the form the tool is allowed in now, when it has one, and the form
// it would be allowed in. A form that no listing record can give back any more is null.
export interface AllowForms {
  readonly allowed: ToolForm | null;
  readonly proposed: ToolForm | null;

  // the override of the definitions that the tool would run under, or null for its annotations
  readonly override?: McpToolOverride | null;
}

const unreadable = 'the form was forgotten, so it cannot be shown';

// What the owner reviews. A server card shows every fact the approval widens, the client ID
// included. A tool card shows each form in full, in canonical JSON, and the effects the tool would
// run under, never a hash of a form.
export function buildMcpProposalBody(operation: McpOperation, forms: AllowForms): ProposalBody {
  if (operation.change === 'server') {
    return {
      sentence: `Connect to the MCP server ${operation.serverID}.`,
      fields: {
        url: operation.facts.url,
        clientID: operation.facts.clientID,
        scopes: operation.facts.scope,
        trusted: operation.facts.trusted ? 'yes' : 'no',
        ...(operation.facts.privateRange === null
          ? {}
          : { privateRange: operation.facts.privateRange }),
      },
      ruleSentence: null,
      approveLabel: 'Add the server',
    };
  }

  return {
    sentence: `Allow the tool ${operation.tool} in the form the server lists now.`,
    fields: {
      ...(operation.fromHash === null
        ? {}
        : {
            allowedForm: forms.allowed === null ? unreadable : formatCanonicalJSON(forms.allowed),
          }),
      newForm: forms.proposed === null ? unreadable : formatCanonicalJSON(forms.proposed),
      ...(forms.proposed === null
        ? {}
        : describeDeclaration(forms.proposed, forms.override ?? null)),
    },
    ruleSentence: null,
    approveLabel: 'Allow the tool',
  };
}

function describeDeclaration(
  form: ToolForm,
  override: McpToolOverride | null,
): Record<string, string> {
  const declared = buildToolDeclaration({
    tool: form.name,
    pinned: form,
    pinnedHash: '',
    override,
    definitionsHash: '',
  });

  if (declared === null) {
    return { effects: 'none declared' };
  }

  const declaration = declared.declaration;

  return {
    effects: declaration.effects.join(', '),
    declaredBy: declared.from === 'override' ? 'the definitions repo' : 'the tool annotations',
    contentArguments: declaration.content.join(', '),
    ...(declaration.destinations.length === 0
      ? {}
      : { destinationArguments: declaration.destinations.join(', ') }),
    ...(declaration.amount === null ? {} : { amountArgument: declaration.amount }),
  };
}
