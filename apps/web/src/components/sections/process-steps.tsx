import { toPersianDigits } from '@roshd/ui';
import type { ProcessStep } from '@/content/types';

/** Numbered process on the dark band (Home, Feasibility). */
export function ProcessSteps({ steps }: { steps: ProcessStep[] }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-y-8">
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-3 ps-0 pe-5">
          <div className="flex items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-accent-soft font-extrabold text-white">
              {toPersianDigits(i + 1)}
            </span>
            <span aria-hidden="true" className="ms-3 h-0.5 flex-1 bg-brand-700" />
          </div>
          <h3 className="mt-1 text-lg font-extrabold text-white">{step.title}</h3>
          <p className="text-sm leading-[1.9] text-on-dark">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}
