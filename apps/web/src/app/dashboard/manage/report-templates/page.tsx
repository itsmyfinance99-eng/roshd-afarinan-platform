'use client';

import { Button, ErrorMessage, SuccessMessage } from '@roshd/ui';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ReportTemplateForm, ReportTemplateList } from '@/components/feasibility/report-templates';
import type { ReportTemplate } from '@/components/feasibility/report-types';
import { useApi } from '@/lib/use-api';

/**
 * Report templates (ST-35.12): the staff of the feasibility platform arrange the chapters a
 * feasibility report has. A report takes the chapters of a template when it is started.
 */
export default function ReportTemplatesPage() {
  const allowed = useCan('feasibility:manage');
  const { state, reload } = useApi<ReportTemplate[]>(
    allowed ? '/report-templates?state=all' : null,
  );
  /** `null`: the list; `'new'` or a template: its form. */
  const [editing, setEditing] = useState<ReportTemplate | 'new' | null>(null);
  const [saved, setSaved] = useState(false);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="قالب‌های گزارش"
        action={
          editing === null ? (
            <Button
              onClick={() => {
                setSaved(false);
                setEditing('new');
              }}
            >
              قالب تازه
            </Button>
          ) : undefined
        }
      />
      {editing !== null ? (
        <ReportTemplateForm
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setSaved(true);
            reload({ silent: true });
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {saved ? <SuccessMessage>قالب ذخیره شد.</SuccessMessage> : null}
          <AsyncBoundary state={state} reload={reload}>
            {(templates) => (
              <ReportTemplateList
                templates={templates}
                onEdit={(template) => {
                  setSaved(false);
                  setEditing(template);
                }}
                onChanged={() => reload({ silent: true })}
              />
            )}
          </AsyncBoundary>
        </div>
      )}
    </>
  );
}
