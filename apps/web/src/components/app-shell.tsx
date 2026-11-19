import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { css } from '../styled-system/css';

const entries = [
  { exact: true, label: 'Conversation', to: '/' },
  { exact: false, label: 'Memory', to: '/memory' },
  { exact: false, label: 'Proposals', to: '/proposals' },
  { exact: false, label: 'Mandates', to: '/mandates' },
  { exact: false, label: 'Moments', to: '/moments' },
  { exact: false, label: 'Tasks', to: '/tasks' },
  { exact: false, label: 'Ended runs', to: '/tasks/ended' },
  { exact: false, label: 'Files', to: '/files' },
  { exact: false, label: 'Definitions', to: '/definitions' },
  { exact: false, label: 'Reminders', to: '/reminders' },
  { exact: false, label: 'Passkeys', to: '/passkeys' },
] as const;

const wideQuery = '(min-width: 768px)';

const bar = css({
  alignItems: 'center',
  backgroundColor: 'canvas',
  borderBottomWidth: '1px',
  display: 'flex',
  height: 'appBar',
  paddingInline: '4',
  position: 'sticky',
  top: '0',
  zIndex: '10',
});

const barNav = css({ display: { base: 'none', md: 'flex' }, gap: '5' });

const menuButton = css({
  borderColor: 'borderStrong',
  borderRadius: 'md',
  borderWidth: '1px',
  cursor: 'pointer',
  display: { base: 'inline-block', md: 'none' },
  fontSize: 'sm',
  paddingBlock: '1',
  paddingInline: '3',
});

const navLink = css({
  borderBottomWidth: '2px',
  borderColor: 'transparent',
  color: 'text',
  fontSize: 'sm',
  paddingBlock: '1',
  _hover: { color: 'link' },
  _currentPage: { borderColor: 'link', color: 'link', fontWeight: 'semibold' },
});

const drawer = css({
  backgroundColor: 'canvas',
  borderInlineEndWidth: '1px',
  color: 'text',
  height: '100dvh',
  insetInlineStart: '0',
  margin: '0',
  maxHeight: '100dvh',
  maxWidth: '85vw',
  padding: '0',
  width: '18rem',
  _backdrop: { backgroundColor: 'scrim' },
  _open: {
    transition: 'inset-inline-start 200ms ease-out',
    _motionReduce: { transition: 'none' },
    _starting: { insetInlineStart: '-100%' },
  },
});

const panel = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  height: '100%',
  padding: '4',
});

const drawerNav = css({ display: 'flex', flexDirection: 'column', gap: '3' });

const closeButton = css({
  alignSelf: 'flex-end',
  borderColor: 'borderStrong',
  borderRadius: 'md',
  borderWidth: '1px',
  cursor: 'pointer',
  fontSize: 'sm',
  paddingBlock: '1',
  paddingInline: '3',
});

export interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell(props: AppShellProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // A modal dialog keeps the page inert, so close it when the window grows past the drawer.
    const query = globalThis.matchMedia(wideQuery);

    const handleChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        dialogRef.current?.close();
      }
    };

    query.addEventListener('change', handleChange);

    return () => {
      query.removeEventListener('change', handleChange);
    };
  }, []);

  const handleOpen = (): void => {
    dialogRef.current?.showModal();
    setIsOpen(true);
  };

  const handleClose = (): void => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const closeDrawer = (): void => {
    dialogRef.current?.close();
  };

  return (
    <>
      <header className={bar}>
        <nav aria-label="Main" className={barNav}>
          {entries.map((entry) => (
            <Link
              activeOptions={{ exact: entry.exact }}
              className={navLink}
              key={entry.to}
              to={entry.to}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Menu"
          className={menuButton}
          onClick={handleOpen}
          ref={buttonRef}
          type="button"
        >
          Menu
        </button>
        <dialog
          aria-label="Menu"
          className={drawer}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDrawer();
            }
          }}
          onClose={handleClose}
          ref={dialogRef}
        >
          <div className={panel}>
            <button className={closeButton} onClick={closeDrawer} type="button">
              Close
            </button>
            <nav aria-label="Main" className={drawerNav}>
              {entries.map((entry) => (
                <Link
                  activeOptions={{ exact: entry.exact }}
                  className={navLink}
                  key={entry.to}
                  onClick={closeDrawer}
                  to={entry.to}
                >
                  {entry.label}
                </Link>
              ))}
            </nav>
          </div>
        </dialog>
      </header>
      {props.children}
    </>
  );
}
