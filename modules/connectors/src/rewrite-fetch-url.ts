// A rule sees a URL that passed the shared gates: http or https, no explicit port, and no query
// string except a lone `?plain=1`. It returns the clean URL, or null when the path does not fit.
interface RewriteRule {
  readonly name: string;
  readonly hosts: readonly string[] | RegExp;
  readonly rewrite: (url: URL) => string | null;
}

const rewriteRules: readonly RewriteRule[] = [
  { name: 'github-blob', hosts: ['github.com'], rewrite: rewriteGitHubBlob },
  { name: 'github-tree', hosts: ['github.com'], rewrite: rewriteGitHubTree },
  { name: 'npm-package', hosts: ['www.npmjs.com'], rewrite: rewriteNPMPackage },
  { name: 'pypi-project', hosts: ['pypi.org'], rewrite: rewritePyPIProject },
  {
    name: 'wikipedia-article',
    hosts: /^(?!(?:www|m)\.)[a-z0-9-]+(?:\.m)?\.wikipedia\.org$/u,
    rewrite: rewriteWikipediaArticle,
  },
];

// null when no rule matches, or when the text is no URL
export function rewriteFetchURL(url: string): string | null {
  const parsed = parseRewritableURL(url);

  if (parsed === null) {
    return null;
  }

  for (const rule of rewriteRules) {
    if (isRuleHost(rule, parsed.hostname)) {
      const rewritten = rule.rewrite(parsed);

      if (rewritten !== null) {
        return rewritten;
      }
    }
  }

  return null;
}

function parseRewritableURL(text: string): URL | null {
  const parsed = URL.parse(text);

  if (parsed === null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return null;
  }

  if (hasExplicitPort(text)) {
    return null;
  }

  if (parsed.search !== '' && !(parsed.search === '?plain=1' && isGitHubBlobPath(parsed))) {
    return null;
  }

  return parsed;
}

// URL parsing drops a port that is the scheme's default, so an explicit :443 shows only in the text.
function hasExplicitPort(text: string): boolean {
  const authority =
    /^\s*[a-z][\w+.-]*:[/\\]*(?<authority>[^/\\?#]*)/iu.exec(text)?.groups?.['authority'] ?? '';

  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1).replace(/^\[[^\]]*\]/u, '');

  return /:\d+$/u.test(hostAndPort);
}

function isGitHubBlobPath(url: URL): boolean {
  return url.hostname === 'github.com' && collectSegments(url, false)?.[2] === 'blob';
}

// The path's segments as held, never decoded. Null for an empty segment, and for a trailing slash
// unless the rule allows one.
function collectSegments(url: URL, mayEndWithSlash: boolean): readonly string[] | null {
  const segments = url.pathname.split('/').slice(1);

  if (mayEndWithSlash && segments.at(-1) === '') {
    segments.pop();
  }

  return segments.includes('') ? null : segments;
}

function rewriteGitHubBlob(url: URL): string | null {
  const segments = collectSegments(url, false);

  if (segments === null || segments.length < 4 || segments[2] !== 'blob') {
    return null;
  }

  const [owner, repo, , ...rest] = segments;

  return `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join('/')}`;
}

function rewriteGitHubTree(url: URL): string | null {
  const segments = collectSegments(url, false);

  if (segments === null || segments.length < 5 || segments[2] !== 'tree') {
    return null;
  }

  const [owner, repo, , ref, ...path] = segments;

  return `https://api.github.com/repos/${owner}/${repo}/contents/${path.join('/')}?ref=${ref}`;
}

function rewriteNPMPackage(url: URL): string | null {
  const segments = collectSegments(url, true);

  if (segments?.[0] !== 'package') {
    return null;
  }

  const [, first] = segments;
  const isScoped = first?.startsWith('@') === true;
  const nameLength = isScoped ? 2 : 1;
  const name = segments.slice(1, 1 + nameLength);
  const rest = segments.slice(1 + nameLength);

  if (name.length !== nameLength) {
    return null;
  }

  const version = readNPMVersion(rest);

  return version === null ? null : `https://registry.npmjs.org/${name.join('%2F')}/${version}`;
}

function readNPMVersion(rest: readonly string[]): string | null {
  if (rest.length === 0) {
    return 'latest';
  }

  return rest.length === 2 && rest[0] === 'v' ? (rest[1] ?? null) : null;
}

function rewritePyPIProject(url: URL): string | null {
  const segments = collectSegments(url, true);

  if (segments?.[0] !== 'project' || segments.length < 2 || segments.length > 3) {
    return null;
  }

  return `https://pypi.org/pypi/${segments.slice(1).join('/')}/json`;
}

function rewriteWikipediaArticle(url: URL): string | null {
  const segments = collectSegments(url, false);

  if (segments === null || segments.length < 2 || segments[0] !== 'wiki') {
    return null;
  }

  const [lang] = url.hostname.split('.');

  return `https://${lang}.wikipedia.org/w/rest.php/v1/page/${segments.slice(1).join('%2F')}/html`;
}

function isRuleHost(rule: RewriteRule, host: string): boolean {
  return rule.hosts instanceof RegExp ? rule.hosts.test(host) : rule.hosts.includes(host);
}
