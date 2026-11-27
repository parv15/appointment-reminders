import type { ReactNode } from 'react';

export function Topbar({ business, tag, children }: { business: string; tag?: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
          <span id="business">{business}</span>
          {tag && <span className="tag">{tag}</span>}
        </div>
        {children}
      </div>
    </header>
  );
}

export function ModeBadge({ sandbox, showLive = false }: { sandbox: boolean; showLive?: boolean }) {
  if (!sandbox && !showLive) return null;
  return <span className={`mode ${sandbox ? 'sandbox' : 'live'}`}>{sandbox ? 'Sandbox, nothing delivered' : 'Live'}</span>;
}
