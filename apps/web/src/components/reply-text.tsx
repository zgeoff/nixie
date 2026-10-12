import type { ComponentProps, ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { css } from '../styled-system/css';

export interface ReplyTextProps {
  readonly text: string;
}

// A reply rendered as Markdown. A reply can quote fetched web text, so raw HTML never becomes
// markup, a link with an unsafe protocol shows as plain text, and every other link opens in a new
// tab with no opener and no referrer.
export function ReplyText(props: ReplyTextProps): ReactNode {
  return (
    <div className={reply}>
      <Markdown components={{ a: ReplyLink, img: ReplyImage }} remarkPlugins={[remarkGfm]}>
        {props.text}
      </Markdown>
    </div>
  );
}

// The renderer blanks a URL whose protocol it does not allow, such as javascript:.
function ReplyLink(props: ComponentProps<'a'>): ReactNode {
  if (props.href === undefined || props.href === '') {
    return <span>{props.children}</span>;
  }

  return (
    <a href={props.href} rel="noopener noreferrer" target="_blank">
      {props.children}
    </a>
  );
}

// An image would load from wherever the reply points, so it shows as a link to the image.
function ReplyImage(props: ComponentProps<'img'>): ReactNode {
  const label = `image: ${props.alt ?? 'untitled'}`;

  return (
    <ReplyLink href={typeof props.src === 'string' ? props.src : undefined}>{label}</ReplyLink>
  );
}

// The reset strips lists, headings and code of their marks, so a reply gets back only what reading
// needs.
const reply = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  overflowWrap: 'anywhere',
  '& a': { textDecoration: 'underline' },
  '& code': { fontFamily: 'mono', fontSize: 'sm' },
  '& h1, & h2, & h3, & h4': { fontWeight: 'semibold' },
  '& ol': { listStyleType: 'decimal', paddingInlineStart: '6' },
  '& pre': { borderWidth: '1px', overflowX: 'auto', padding: '2' },
  '& table': { borderCollapse: 'collapse' },
  '& td, & th': { borderWidth: '1px', paddingInline: '2' },
  '& ul': { listStyleType: 'disc', paddingInlineStart: '6' },
});
