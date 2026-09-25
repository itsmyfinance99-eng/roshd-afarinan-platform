import type { ReactNode } from 'react';

/** Centered card used by /login and /register. */
export function AuthCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden bg-surface">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(#e6ebf3_1px,transparent_1px),linear-gradient(90deg,#e6ebf3_1px,transparent_1px)] bg-size-[48px_48px] opacity-60"
      />
      <div className="relative mx-auto flex min-h-[70vh] max-w-[480px] flex-col justify-center px-6 py-16">
        <div className="rounded-panel border border-line-2 bg-white p-7 sm:p-8">
          <h1 className="mb-2 text-2xl font-extrabold text-brand-900">{title}</h1>
          <p className="mb-6 text-sm leading-loose text-ink-4">{lead}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
