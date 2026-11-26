import type { Node, SourceFile } from 'typescript/unstable/ast';
import { SyntaxKind } from 'typescript/unstable/ast';
import {
  isBinaryExpression,
  isElementAccessExpression,
  isIdentifier,
  isIndexedAccessTypeNode,
  isLiteralTypeNode,
  isNoSubstitutionTemplateLiteral,
  isPrivateIdentifier,
  isStringLiteral,
  isTemplateHead,
  isTemplateMiddle,
  isTemplateTail,
} from 'typescript/unstable/ast/is';

// The rule is in `namesRule` of collect-name-faults, and the tests of this file hold each case.
// The compiler's tree holds no comments, and regex literals and JSX text are nodes this walk never
// reads, so only identifiers and string and template text count.
export function collectNameHits(tree: SourceFile, names: readonly string[]): string[] {
  const found = new Set<string>();

  const visit = (node: Node): void => {
    if (isIdentifier(node) || isPrivateIdentifier(node)) {
      for (const candidate of collectIdentifierNames(node.text)) {
        found.add(candidate);
      }
    } else if (isLiteralText(node) && !isPropertyName(node)) {
      found.add(toComparable(node.text));
    }

    node.forEachChild(visit);
  };

  visit(tree);

  return names.filter((name) => found.has(toComparable(name)));
}

// Identifiers that the platform defines, which say nothing about a feature
const platformIdentifiers: ReadonlySet<string> = new Set([
  'codePoint',
  'codePointAt',
  'fromCodePoint',
  'searchParams',
]);

// Names that are ordinary English words, or a term of nixie's glossary. An identifier that is one
// of them alone, such as the `code` of an error or the `imp` of a sandbox, says nothing about a
// feature, so only a longer identifier or a string counts.
const plainWordNames: ReadonlySet<string> = new Set([
  'code',
  'coding',
  'computer',
  'devices',
  'images',
  'imp',
  'mail',
  'search',
  'spend',
  'voice',
]);

function collectIdentifierNames(identifier: string): string[] {
  if (platformIdentifiers.has(identifier)) {
    return [];
  }

  const leading = collectLeadingNames(identifier);
  const whole = toComparable(identifier);

  return plainWordNames.has(whole) ? leading : [...leading, whole];
}

// The names that a compound identifier holds: each run of its leading words. A one-word
// identifier holds none.
function collectLeadingNames(identifier: string): string[] {
  const words = splitWords(identifier);
  const names: string[] = [];

  for (let count = 1; count < words.length; count += 1) {
    names.push(toComparable(words.slice(0, count).join('')));
  }

  return names;
}

function splitWords(identifier: string): string[] {
  return identifier
    .replaceAll(/(?<before>[a-z0-9])(?<after>[A-Z])/gu, '$<before> $<after>')
    .replaceAll(/(?<before>[A-Z]+)(?<after>[A-Z][a-z])/gu, '$<before> $<after>')
    .split(/[\s_$]+/u)
    .filter((word) => word !== '');
}

function toComparable(text: string): string {
  return text.toLowerCase().replaceAll(/[_-]/gu, '');
}

type LiteralText = Node & { readonly text: string };

function isLiteralText(node: Node): node is LiteralText {
  return (
    isStringLiteral(node) ||
    isNoSubstitutionTemplateLiteral(node) ||
    isTemplateHead(node) ||
    isTemplateMiddle(node) ||
    isTemplateTail(node)
  );
}

// A string that names a property, as the operand of `in` or the key of an indexed access, holds a
// word of the data it describes and never a feature.
function isPropertyName(node: Node): boolean {
  const parent = node.parent;

  if (isBinaryExpression(parent)) {
    return parent.left === node && parent.operatorToken.kind === SyntaxKind.InKeyword;
  }

  if (isElementAccessExpression(parent)) {
    return parent.argumentExpression === node;
  }

  return (
    isLiteralTypeNode(parent) &&
    isIndexedAccessTypeNode(parent.parent) &&
    parent.parent.indexType === parent
  );
}
