// A template that a build bakes absolute paths into belongs to the checkout it was built in, and
// the template folder holds every checkout's templates, so the checkout's path joins the name.
export function buildTemplateName(name: string, checkoutPath: string): string {
  const hash = new Bun.CryptoHasher('sha256').update(checkoutPath).digest('hex');

  return `${name}-${hash.slice(0, 8)}`;
}
