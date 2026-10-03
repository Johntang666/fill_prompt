import type { CSSProperties } from 'react';

const paths = {
  spark: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></>,
  download: <><path d="M12 3v13m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
  edit: <><path d="m15 5 4 4M4 20l4.5-1L20 7.5a2.8 2.8 0 0 0-4-4L4.5 15 4 20Z" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  grip: <><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" strokeWidth="3" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4v.1" /></>,
  document: <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h5" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>,
};

export function Icon({ name, size = 18, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
