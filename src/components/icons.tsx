// Original line icons (stroke-based, 24px grid).
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  overview: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" />,
  entities: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 7.5l3 8M16 7.5l-3 8M8.5 6h7" />
    </>
  ),
  deal: <path d="M4 7h16M4 12h10M4 17h7M17 14l3 3-3 3" />,
  flow: <path d="M3 7c6 0 6 10 12 10h6M3 17c6 0 6-10 12-10h6M18 4l3 3-3 3M18 14l3 3-3 3" />,
  tax: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  fiba: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18M6 5.5c3 3 3 10 0 13M18 5.5c-3 3-3 10 0 13" />
    </>
  ),
  revenue: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  documents: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </>
  ),
  compare: <path d="M8 4v16M16 4v16M4 8h8M12 16h8" />,
  recommend: <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.3 9.2l6.1-.6z" />,
  reports: (
    <>
      <path d="M5 3h14v18H5z" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  dollar: <path d="M12 2v20M17 6.5c-1-1.5-2.8-2.5-5-2.5-2.8 0-5 1.6-5 4s2 3.4 5 4c3 .6 5 1.6 5 4s-2.2 4-5 4c-2.4 0-4.4-1-5.3-2.8" />,
  whatif: (
    <>
      <path d="M9 9a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8V15" />
      <circle cx="12" cy="18.5" r=".6" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  ops: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  reset: <path d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.5 2M18.5 9A7 7 0 0 0 6 7" />,
  save: <path d="M5 3h11l3 3v15H5zM8 3v6h7M8 21v-7h8v7" />,
  check: <path d="M5 12l5 5 9-11" />,
  warn: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  structure: <path d="M12 3v6M5 21v-6h14v6M12 9H5v6M12 9h7v6" />,
  analysis: <path d="M4 20V10M9 20V4M14 20v-8M19 20v-5" />,
  play: <path d="M7 4l13 8-13 8z" />,
  next: <path d="M9 5l7 7-7 7" />,
  prev: <path d="M15 5l-7 7 7 7" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  print: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
};

export function Icon({ name, size = 20, className = '', title }: { name: keyof typeof P | string; size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {P[name] ?? P.info}
    </svg>
  );
}
