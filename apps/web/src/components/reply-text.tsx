import type { ComponentProps, ReactNode } from 'react';
import { createContext, use } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { css } from '../styled-system/css';

export interface ReplyTextProps {
  readonly text: string;
}

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

// A reply can quote fetched web text, so raw HTML never becomes markup, and an outside link opens
// in a new tab with no opener and no referrer.
export function ReplyText(props: ReplyTextProps): ReactNode {
  return (
    <div className={reply}>
      {/* oxlint-disable-next-line id-length -- react-markdown keys each component by its HTML tag, here `a` */}
      <Markdown components={{ a: ReplyLink, img: ReplyImage }} remarkPlugins={[remarkGfm]}>
        {props.text}
      </Markdown>
    </div>
  );
}

const InsideLink = createContext(false);

// react-markdown blanks a URL whose protocol it does not allow, such as javascript:.
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

// An image would load from wherever the reply points, so it renders as a link. HTML breaks an
// anchor nested in another anchor, so inside a link the image renders as its label alone.
function ReplyImage(props: ComponentProps<'img'>): ReactNode {
  const label = `image: ${props.alt ?? 'untitled'}`;

  if (use(InsideLink)) {
    return label;
  }

  return (
    <ReplyLink href={typeof props.src === 'string' ? props.src : undefined}>{label}</ReplyLink>
  );
}
