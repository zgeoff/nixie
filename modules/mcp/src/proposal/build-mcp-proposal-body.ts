import type { ProposalBody } from '@heynixie/proposals';
import { formatCanonicalJSON } from '../pin/format-canonical-json';
import { buildProxiedDeclaration } from '../registry/build-proxied-definition';
import type { McpOperation, ToolForm } from '../types';

// The forms an allow card shows: the form the tool is allowed in now, when it has one, and the form
// it would be allowed in. A form that no listing record can give back any more is null.
export interface AllowForms {
  readonly allowed: ToolForm | null;
  readonly proposed: ToolForm | null;
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
      ...(forms.proposed === null ? {} : describeDeclaration(forms.proposed)),
    },
    ruleSentence: null,
    approveLabel: 'Allow the tool',
  };
}

function describeDeclaration(form: ToolForm): Record<string, string> {
  const declaration = buildProxiedDeclaration(form);

  if (declaration === null) {
    return { effects: 'none declared' };
  }

  return {
    effects: declaration.effects.join(', '),
    contentArguments: declaration.content.join(', '),
  };
}
