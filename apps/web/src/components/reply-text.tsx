import type { ComponentProps, ReactNode } from 'react';
import { createContext, use } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { css } from '../styled-system/css';

export interface ReplyTextProps {
  readonly text: string;
}

// The reset strips lists, headings and code of their marks, so a reply gets back only what reading
// needs. Code sits on the theme's surface colour, so it stands apart from the prose around it.
const reply = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  overflowWrap: 'anywhere',
  '& a': { color: 'link', textDecoration: 'underline' },
  '& code': { fontFamily: 'mono', fontSize: 'sm' },
  '& :not(pre) > code': { backgroundColor: 'surface', borderRadius: 'sm', paddingInline: '1' },
  '& h1, & h2, & h3, & h4': { fontWeight: 'semibold' },
  '& ol': { listStyleType: 'decimal', paddingInlineStart: '6' },
  '& pre': { backgroundColor: 'surface', borderWidth: '1px', overflowX: 'auto', padding: '2' },
  '& table': { borderCollapse: 'collapse' },
  '& td, & th': { borderWidth: '1px', paddingInline: '2' },
  '& ul': { listStyleType: 'disc', paddingInlineStart: '6' },
});

// A reply rendered as Markdown. A reply can quote fetched web text, so raw HTML never becomes
// markup, a link with an unsafe protocol shows as plain text, and every other link opens in a new
// tab with no opener and no referrer.
export function ReplyText(props: ReplyTextProps): ReactNode {
  return (
    <div className={reply}>
      {/* oxlint-disable-next-line id-length -- react-markdown keys each component by its HTML tag */}
      <Markdown components={{ a: ReplyLink, img: ReplyImage }} remarkPlugins={[remarkGfm]}>
        {props.text}
      </Markdown>
    </div>
  );
}

// whether an element renders inside a link's anchor, where another anchor would break the outer one
const InsideLink = createContext(false);

// The renderer blanks a URL whose protocol it does not allow, such as javascript:. A link inside
// the reply, such as a footnote and its way back, keeps the page and the anchor IDs it jumps
// between.
function ReplyLink(props: ComponentProps<'a'>): ReactNode {
  if (props.href === undefined || props.href === '') {
    return <span>{props.children}</span>;
  }

  if (props.href.startsWith('#')) {
    return (
      <a
        aria-describedby={props['aria-describedby']}
        aria-label={props['aria-label']}
        data-footnote-backref={readDataProp(props, 'data-footnote-backref')}
        data-footnote-ref={readDataProp(props, 'data-footnote-ref')}
        href={props.href}
        id={props.id}
      >
        <InsideLink value>{props.children}</InsideLink>
      </a>
    );
  }

  return (
    <a href={props.href} id={props.id} rel="noopener noreferrer" target="_blank">
      <InsideLink value>{props.children}</InsideLink>
    </a>
  );
}

// The renderer marks a footnote's links with data attributes, which the element's props type
// leaves out.
function readDataProp(props: object, name: string): unknown {
  const value: unknown = Reflect.get(props, name);

  return value;
}

// An image would load from wherever the reply points, so it shows as a link to the image. Inside
// a link it shows as the link's label alone, since an anchor in an anchor breaks the outer one.
function ReplyImage(props: ComponentProps<'img'>): ReactNode {
  const label = `image: ${props.alt ?? 'untitled'}`;

  if (use(InsideLink)) {
    return label;
  }

  return (
    <ReplyLink href={typeof props.src === 'string' ? props.src : undefined}>{label}</ReplyLink>
  );
}
