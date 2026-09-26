import { ProjectCard } from '@/components/cards/cards';
import type { InvestmentSummary } from '@/lib/investment-api';

/** Latest published opportunities on the home page (filters live on /investment). */
export function InvestmentPreview({ projects }: { projects: InvestmentSummary[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
