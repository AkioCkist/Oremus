import React, { useEffect, useRef, useState } from 'react';

/*
 * The signed-in menu in the top bar (overrides AdminJS's LoggedIn). AdminJS's own opens on hover only and its
 * "Log out" has no link, so it cannot be reached with the keyboard. This one is a real button that opens on click,
 * Enter or Space, closes on Escape or a click elsewhere, and "Log out" is a plain link.
 */

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

export default function LoggedIn({ session, paths }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && open) { setOpen(false); button.current?.focus(); }
  };

  return (
    <div ref={root} data-css="logged-in" className="oa-user" onKeyDown={onKeyDown}>
      <button ref={button} type="button" className="oa-user-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="oa-user-text">
          <span className="oa-user-name">{session.title || session.email}</span>
          <span className="oa-user-email">{session.email}</span>
        </span>
        {session.avatarUrl
          ? <img src={session.avatarUrl} alt="" className="oa-user-avatar" />
          : <span aria-hidden="true" className="oa-user-avatar">{initials(session.title || session.email)}</span>}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="oa-user-chevron"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div role="menu" aria-label="Account" className="oa-user-menu" data-open={open}>
        <a role="menuitem" href={paths.logoutPath} tabIndex={open ? 0 : -1}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Log out
        </a>
      </div>
    </div>
  );
}
