import { EmptyState, Tag } from '@roshd/ui';
import {
  QUESTION_TYPE_LABELS_FA,
  type Question,
  type QuestionnaireDefinition,
  type TableColumn,
} from '@roshd/validation';

const box = 'rounded-control border border-line-strong bg-brand-700 px-3.5 text-[15px] text-ink-5';

function unitsOf(rule: { unit?: string; units?: string[] }): string | null {
  if (rule.units) return rule.units.join(' / ');
  return rule.unit ?? null;
}

function columnHint(column: TableColumn): string {
  if (column.type === 'number') return unitsOf(column) ?? 'عدد';
  if (column.type === 'date') return 'تاریخ';
  if (column.type === 'single_choice') return column.options.map((o) => o.label).join(' / ');
  return 'متن';
}

/** What the applicant will be given to answer with, drawn and not working. */
function Answer({ question }: { question: Question }) {
  switch (question.type) {
    case 'text':
    case 'date':
      return <div className={`${box} h-12 max-w-md`} />;
    case 'long_text':
      return <div className={`${box} h-28`} />;
    case 'number':
      return (
        <div className="flex max-w-md items-center gap-2">
          <div className={`${box} h-12 flex-1`} />
          {unitsOf(question) ? (
            <span className="text-sm text-ink-3">{unitsOf(question)}</span>
          ) : null}
        </div>
      );
    case 'single_choice':
    case 'multiple_choice':
      return (
        <ul className="flex flex-col gap-1.5 text-[15px]">
          {question.options.map((option) => (
            <li key={option.value} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-4 border border-line-strong ${
                  question.type === 'single_choice' ? 'rounded-full' : 'rounded-[4px]'
                }`}
              />
              {option.label}
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr>
                {question.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="border border-line-strong bg-surface-2 px-3 py-2 text-start font-bold"
                  >
                    {column.label}
                    {column.required ? <span className="ms-1 text-danger">*</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {question.columns.map((column) => (
                  <td
                    key={column.key}
                    className="border border-line-strong px-3 py-2 text-[13px] text-ink-5"
                  >
                    {columnHint(column)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      );
    case 'file':
      return (
        <div className={`${box} flex h-12 max-w-md items-center border-dashed`}>بارگذاری فایل</div>
      );
  }
}

/**
 * A questionnaire as its applicant will read it (ST-35.04): sections, questions with what they
 * ask for, and the documents to hand in. Nothing in it can be filled in.
 */
export function QuestionnairePreview({ definition }: { definition: QuestionnaireDefinition }) {
  if (definition.sections.length === 0 && definition.documents.length === 0) {
    return (
      <EmptyState
        title="پرسشنامه هنوز خالی است"
        description="با افزودن بخش و سؤال، پیش‌نمایش آن اینجا دیده می‌شود."
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {definition.sections.map((section) => (
        <section key={section.key} aria-labelledby={`preview-${section.key}`}>
          <h3 id={`preview-${section.key}`} className="text-lg font-extrabold text-brand-900">
            {section.title}
          </h3>
          {section.description ? (
            <p className="mt-1 text-[15px] whitespace-pre-line text-ink-3">{section.description}</p>
          ) : null}
          {section.questions.length === 0 ? (
            <p className="mt-3 text-[15px] text-ink-5">این بخش هنوز سؤالی ندارد.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-5">
              {section.questions.map((question) => (
                <li key={question.key} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">
                      {question.label}
                      {question.required ? (
                        <span className="ms-1 text-danger" title="الزامی">
                          *
                        </span>
                      ) : null}
                    </span>
                    <Tag>{QUESTION_TYPE_LABELS_FA[question.type]}</Tag>
                  </div>
                  {question.help ? <p className="text-[13px] text-ink-3">{question.help}</p> : null}
                  <Answer question={question} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
      {definition.documents.length > 0 ? (
        <section aria-labelledby="preview-documents">
          <h3 id="preview-documents" className="text-lg font-extrabold text-brand-900">
            مدارک
          </h3>
          <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-[15px]">
            {definition.documents.map((document) => (
              <li key={document.key}>
                {document.label}
                {document.required ? <span className="ms-1 text-danger">*</span> : null}
                {document.help ? (
                  <span className="block text-[13px] text-ink-3">{document.help}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
