import { describe, expect, it } from 'vitest';
import {
  assignExpertSchema,
  convertRequestToProjectSchema,
  createFeasibilityProjectSchema,
  FEASIBILITY_ACTOR_LABELS_FA,
  FEASIBILITY_ACTORS,
  FEASIBILITY_STATUS_LABELS_FA,
  FEASIBILITY_STATUSES,
  feasibilityTransitionSchema,
  listFeasibilityProjectsQuerySchema,
  updateFeasibilityProjectSchema,
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

  it('changes only the details that are sent and clears an optional one with null', () => {
    expect(updateFeasibilityProjectSchema.parse({ title: ' طرح تازه ' })).toEqual({
      title: 'طرح تازه',
    });
    expect(
      updateFeasibilityProjectSchema.parse({ sector: null, location: null, summary: '' }),
    ).toEqual({ sector: null, location: null, summary: '' });
    expect(updateFeasibilityProjectSchema.safeParse({}).success).toBe(false);
    expect(updateFeasibilityProjectSchema.safeParse({ title: null }).success).toBe(false);
    expect(updateFeasibilityProjectSchema.safeParse({ sector: 'ناشناخته' }).success).toBe(false);
    // Fields the applicant does not own are not taken over.
    expect(
      updateFeasibilityProjectSchema.parse({ title: 'طرح تازه', status: 'DELIVERED' }),
    ).toEqual({ title: 'طرح تازه' });
  });

  it('needs the request and a title to make a project from it', () => {
    const requestId = '0198c0de-0000-7000-8000-000000000000';
    expect(convertRequestToProjectSchema.parse({ requestId, title: ' کارخانه مس ' })).toEqual({
      requestId,
      title: 'کارخانه مس',
    });
    expect(convertRequestToProjectSchema.safeParse({ requestId }).success).toBe(false);
    expect(convertRequestToProjectSchema.safeParse({ requestId: 'r1', title: 'طرح' }).success).toBe(
      false,
    );
  });

  it('finds the project of a request by the id of the request', () => {
    const sourceRequestId = '0198c0de-0000-7000-8000-000000000000';
    expect(listFeasibilityProjectsQuerySchema.parse({ sourceRequestId }).sourceRequestId).toBe(
      sourceRequestId,
    );
    expect(listFeasibilityProjectsQuerySchema.safeParse({ sourceRequestId: 'r1' }).success).toBe(
      false,
    );
  });

  it('needs the id of the expert', () => {
    expect(assignExpertSchema.safeParse({ expertId: 'someone' }).success).toBe(false);
    expect(assignExpertSchema.safeParse({}).success).toBe(false);
  });
});
