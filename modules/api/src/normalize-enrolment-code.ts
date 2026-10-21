export function normalizeEnrolmentCode(code: string): string {
  return code
    .toUpperCase()
    .replaceAll(/[\s-]/gu, '')
    .replaceAll('O', '0')
    .replaceAll(/[IL]/gu, '1');
}
