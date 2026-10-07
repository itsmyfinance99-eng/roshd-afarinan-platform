import type { FeasibilityPipelineQuery } from '@roshd/validation';
import type { Prisma } from '../../generated/prisma/client';

/** The projects the filters of the pipeline leave: by sector, and by the expert working on them. */
export function pipelineWhere(
  query: FeasibilityPipelineQuery,
): Prisma.FeasibilityProjectWhereInput {
  return {
    ...(query.sector ? { sector: query.sector } : {}),
    ...(query.expertId === 'none'
      ? { experts: { none: { endedAt: null } } }
      : query.expertId
        ? { experts: { some: { expertId: query.expertId, endedAt: null } } }
        : {}),
  };
}
