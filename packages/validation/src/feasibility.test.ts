import { describe, expect, it } from 'vitest';
import {
  assignExpertSchema,
  createFeasibilityProjectSchema,
  FEASIBILITY_ACTOR_LABELS_FA,
  FEASIBILITY_ACTORS,
  FEASIBILITY_STATUS_LABELS_FA,
  FEASIBILITY_STATUSES,
  feasibilityTransitionSchema,
  listFeasibilityProjectsQuerySchema,
} from './feasibility';

describe('feasibility schemas', () => {
  it('labels every status and every actor', () => {
    expect(Object.keys(FEASIBILITY_STATUS_LABELS_FA)).toEqual([...FEASIBILITY_STATUSES]);
    expect(Object.keys(FEASIBILITY_ACTOR_LABELS_FA)).toEqual([...FEASIBILITY_ACTORS]);
  });

  it('accepts a project with a title only and normalises its text', () => {
    expect(createFeasibilityProjectSchema.parse({ title: '  طرح فرآوري  ' })).toEqual({
      title: 'طرح فرآوری',
    });
    const full = createFeasibilityProjectSchema.parse({
      title: 'طرح فرآوری',
      sector: 'معدنی',
      location: 'یزد',
      summary: '',
    });
    expect(full).toMatchObject({ sector: 'معدنی', location: 'یزد', summary: '' });
  });

  it('refuses a short title, an unknown sector and an overlong summary', () => {
    const result = createFeasibilityProjectSchema.safeParse({
      title: 'ط',
      sector: 'فضایی',
      summary: 'ن'.repeat(5001),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'sector',
      'summary',
      'title',
    ]);
  });

  it("lists the caller's own projects by default", () => {
    expect(listFeasibilityProjectsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      scope: 'mine',
    });
    expect(listFeasibilityProjectsQuerySchema.safeParse({ scope: 'everyone' }).success).toBe(false);
    expect(listFeasibilityProjectsQuerySchema.safeParse({ status: 'OPEN' }).success).toBe(false);
  });

  it('takes a known target status with an optional note', () => {
    expect(feasibilityTransitionSchema.parse({ to: 'SUBMITTED' })).toEqual({ to: 'SUBMITTED' });
    expect(feasibilityTransitionSchema.parse({ to: 'ARCHIVED', note: ' انصراف ' }).note).toBe(
      'انصراف',
    );
    expect(feasibilityTransitionSchema.safeParse({ to: 'DONE' }).success).toBe(false);
    expect(
      feasibilityTransitionSchema.safeParse({ to: 'SUBMITTED', note: 'ن'.repeat(2001) }).success,
    ).toBe(false);
  });

  it('needs the id of the expert', () => {
    expect(assignExpertSchema.safeParse({ expertId: 'someone' }).success).toBe(false);
    expect(assignExpertSchema.safeParse({}).success).toBe(false);
  });
});
