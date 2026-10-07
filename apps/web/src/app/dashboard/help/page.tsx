'use client';

import { ROLE_LABELS_FA } from '@roshd/types';
import Link from 'next/link';
import { useMe } from '@/components/dashboard/me-context';
import { visibleNav } from '@/components/dashboard/nav';
import { PageTitle } from '@/components/dashboard/ui';
import {
  DASHBOARD_HELP_FA,
  DASHBOARD_HELP_INTRO_FA,
  DASHBOARD_HELP_TIPS_FA,
  ROLE_HELP_FA,
  visibleSteps,
} from '@/content/dashboard-help';

/** The guide of the dashboard: the parts of the reader's own menu, each in plain words. */
export default function DashboardHelpPage() {
  const me = useMe();
  const roles = me.roles.filter((role) => ROLE_HELP_FA[role] !== undefined);
  const sections = visibleNav(me.permissions).flatMap((item) => {
    const help = DASHBOARD_HELP_FA[item.href];
    return help
      ? [{ ...item, summary: help.summary, steps: visibleSteps(help, me.permissions) }]
      : [];
  });

  return (
    <>
      <PageTitle title="راهنمای پنل" />
      <div className="flex max-w-3xl flex-col gap-8 text-[15px] leading-8 text-ink">
        <section aria-labelledby="help-intro" className="flex flex-col gap-2">
          <h2 id="help-intro" className="text-lg font-bold text-brand-900">
            پنل چطور کار می‌کند
          </h2>
          {DASHBOARD_HELP_INTRO_FA.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>

        {roles.length > 0 ? (
          <section aria-labelledby="help-roles" className="flex flex-col gap-2">
            <h2 id="help-roles" className="text-lg font-bold text-brand-900">
              نقش شما
            </h2>
            <dl className="flex flex-col gap-2">
              {roles.map((role) => (
                <div key={role} className="rounded-card border border-line bg-white p-4">
                  <dt className="font-bold">{ROLE_LABELS_FA[role]}</dt>
                  <dd className="text-ink-3">{ROLE_HELP_FA[role]}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="help-sections" className="flex flex-col gap-3">
          <h2 id="help-sections" className="text-lg font-bold text-brand-900">
            بخش‌های منوی شما
          </h2>
          <ul className="flex flex-col gap-3">
            {sections.map((section) => (
              <li key={section.href} className="rounded-card border border-line bg-white p-4">
                <h3 className="text-base font-bold">
                  <Link href={section.href} className="text-accent">
                    {section.label}
                  </Link>
                </h3>
                <p className="text-ink-3">{section.summary}</p>
                <ul className="mt-1 list-disc ps-5">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="help-tips" className="flex flex-col gap-2">
          <h2 id="help-tips" className="text-lg font-bold text-brand-900">
            چند نکته
          </h2>
          <ul className="list-disc ps-5">
            {DASHBOARD_HELP_TIPS_FA.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
