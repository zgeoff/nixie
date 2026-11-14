import type { ParseProblem, ParsedSkill, SkillDocument } from '@heynixie/definitions';
import { checkSkillFiles, parseSkillFrontmatter } from '@heynixie/definitions';

export type VendoredSkill =
  | { readonly status: 'ok'; readonly skill: ParsedSkill }
  | { readonly status: 'refused'; readonly reason: string };

export function parseVendoredSkill(
  folderPath: string,
  files: readonly { readonly path: string; readonly text: string }[],
): VendoredSkill {
  const instructions = files.find((file) => file.path === 'SKILL.md');

  const document =
    instructions === undefined
      ? null
      : parseSkillFrontmatter(instructions.text.replaceAll('\r\n', '\n'));

  if (document === null || !isSkillDocument(document)) {
    return {
      status: 'refused',
      reason: `${folderPath} holds no SKILL.md with valid frontmatter, so it is no skill`,
    };
  }

  const checked = checkSkillFiles(document.frontmatter.name, files);

  return isProblemList(checked)
    ? { status: 'refused', reason: renderProblems(checked) }
    : { status: 'ok', skill: checked };
}

function isSkillDocument(document: SkillDocument | readonly string[]): document is SkillDocument {
  return !Array.isArray(document);
}

function isProblemList(
  checked: ParsedSkill | readonly ParseProblem[],
): checked is readonly ParseProblem[] {
  return Array.isArray(checked);
}

function renderProblems(problems: readonly ParseProblem[]): string {
  const lines = problems.map((problem) => `${problem.path}: ${problem.reason}`);

  return `the skill fails the checks the seed runs, so nixie cannot vendor it:\n${lines.join('\n')}`;
}
