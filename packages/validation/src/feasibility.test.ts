import { describe, expect, it } from 'vitest';
import {
  exportFeasibilityProjectsQuerySchema,
  feasibilityPipelineQuerySchema,
  assignExpertSchema,
  confirmContractSchema,
  convertRequestToProjectSchema,
  createFeasibilityProjectSchema,
  FEASIBILITY_ACTOR_LABELS_FA,
  FEASIBILITY_ACTORS,
  FEASIBILITY_STATUS_LABELS_FA,
  FEASIBILITY_STATUSES,
  feasibilityCostEstimateSchema,
  feasibilityTransitionSchema,
  listFeasibilityProjectsQuerySchema,
  updateFeasibilityProjectSchema,
  createInternalNoteSchema,
  createReviewReplySchema,
  createReviewThreadSchema,
  FEASIBILITY_REVIEW_SECTION_LABELS_FA,
  FEASIBILITY_REVIEW_SECTIONS,
  FEASIBILITY_WORK_STATUSES,
  listReviewThreadsQuerySchema,
  setReviewThreadHandledSchema,
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

  it('narrows the pipeline by sector and by an expert, or by nobody', () => {
    const expertId = '0199c2a4-7b1e-7c3a-9d2f-3b5a6c7d8e9f';
    expect(feasibilityPipelineQuerySchema.parse({})).toEqual({});
    expect(feasibilityPipelineQuerySchema.parse({ sector: 'معدنی', expertId })).toEqual({
      sector: 'معدنی',
      expertId,
    });
    expect(feasibilityPipelineQuerySchema.parse({ expertId: 'none' }).expertId).toBe('none');
    expect(feasibilityPipelineQuerySchema.safeParse({ expertId: 'me' }).success).toBe(false);
    expect(feasibilityPipelineQuerySchema.safeParse({ sector: 'ناشناخته' }).success).toBe(false);
    // The list takes the same filters and an order; the export a status beside them.
    expect(
      listFeasibilityProjectsQuerySchema.parse({ scope: 'all', expertId: 'none', sort: 'waiting' }),
    ).toMatchObject({ expertId: 'none', sort: 'waiting' });
    expect(listFeasibilityProjectsQuerySchema.safeParse({ sort: 'oldest' }).success).toBe(false);
    expect(
      exportFeasibilityProjectsQuerySchema.parse({ status: 'IN_PROGRESS', sector: 'انرژی' }),
    ).toEqual({ status: 'IN_PROGRESS', sector: 'انرژی' });
    expect(exportFeasibilityProjectsQuerySchema.safeParse({ status: 'OPEN' }).success).toBe(false);
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

  it('takes a cost estimate in whole rials with what it covers and how long it takes', () => {
    const estimate = {
      amountRials: '۲٬۵۰۰٬۰۰۰٬۰۰۰',
      scope: ' مطالعه بازار، فنی و مالی طرح ',
      durationDays: 45,
    };
    expect(feasibilityCostEstimateSchema.parse(estimate)).toEqual({
      amountRials: '2500000000',
      scope: 'مطالعه بازار، فنی و مالی طرح',
      durationDays: 45,
    });
    const refused = (over: object) =>
      feasibilityCostEstimateSchema.safeParse({ ...estimate, ...over }).success;
    // Money is whole and positive; it is never a JS number.
    expect(refused({ amountRials: '0' })).toBe(false);
    expect(refused({ amountRials: '-5' })).toBe(false);
    expect(refused({ amountRials: '10.5' })).toBe(false);
    expect(refused({ amountRials: 2500000000 })).toBe(false);
    expect(refused({ amountRials: undefined })).toBe(false);
    expect(refused({ scope: 'کوتاه' })).toBe(false);
    expect(refused({ scope: 'ش'.repeat(5001) })).toBe(false);
    expect(refused({ durationDays: 0 })).toBe(false);
    expect(refused({ durationDays: 1.5 })).toBe(false);
    expect(refused({ durationDays: 3651 })).toBe(false);
    expect(refused({ durationDays: '45' })).toBe(false);
    expect(refused({ note: 'ن'.repeat(2001) })).toBe(false);
    expect(refused({ durationDays: 3650, note: ' با احترام ' })).toBe(true);
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

  it('confirms a contract with an optional note of bounded length', () => {
    expect(confirmContractSchema.parse({})).toEqual({});
    expect(confirmContractSchema.parse({ note: '  قرارداد دریافت شد  ' })).toEqual({
      note: 'قرارداد دریافت شد',
    });
    expect(confirmContractSchema.safeParse({ note: 'ن'.repeat(2001) }).success).toBe(false);
  });

  it('needs the id of the expert', () => {
    expect(assignExpertSchema.safeParse({ expertId: 'someone' }).success).toBe(false);
    expect(assignExpertSchema.safeParse({}).success).toBe(false);
  });

  it('takes an internal note of bounded length and never an empty one', () => {
    expect(createInternalNoteSchema.parse({ body: '  با متقاضی تماس گرفته شد  ' })).toEqual({
      body: 'با متقاضی تماس گرفته شد',
    });
    expect(createInternalNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createInternalNoteSchema.safeParse({}).success).toBe(false);
    expect(createInternalNoteSchema.safeParse({ body: 'ی'.repeat(4000) }).success).toBe(true);
    expect(createInternalNoteSchema.safeParse({ body: 'ی'.repeat(4001) }).success).toBe(false);
  });

  it('counts the work on a study from the confirmed contract to the delivery', () => {
    expect(FEASIBILITY_WORK_STATUSES).toEqual(['IN_PROGRESS', 'EXPERT_REVIEW', 'CLIENT_REVIEW']);
  });

  it('names every part of a study a review comment is written on', () => {
    expect(new Set(FEASIBILITY_REVIEW_SECTIONS).size).toBe(FEASIBILITY_REVIEW_SECTIONS.length);
    expect(FEASIBILITY_REVIEW_SECTIONS[0]).toBe('general');
    for (const section of FEASIBILITY_REVIEW_SECTIONS) {
      expect(FEASIBILITY_REVIEW_SECTION_LABELS_FA[section]).toBeTruthy();
    }
  });

  it('takes a review comment on a known part of the study', () => {
    expect(createReviewThreadSchema.parse({ section: 'market', body: '  رقم تقاضا  ' })).toEqual({
      section: 'market',
      body: 'رقم تقاضا',
    });
    expect(
      createReviewThreadSchema.parse({ section: 'general', body: 'متن', shared: true }).shared,
    ).toBe(true);
    expect(createReviewThreadSchema.safeParse({ section: 'chapter-9', body: 'متن' }).success).toBe(
      false,
    );
    expect(createReviewThreadSchema.safeParse({ section: 'market', body: '  ' }).success).toBe(
      false,
    );
    expect(
      createReviewThreadSchema.safeParse({ section: 'market', body: 'متن', shared: 'yes' }).success,
    ).toBe(false);
    expect(createReviewReplySchema.safeParse({ body: 'ی'.repeat(4000) }).success).toBe(true);
    expect(createReviewReplySchema.safeParse({ body: 'ی'.repeat(4001) }).success).toBe(false);
    expect(createReviewReplySchema.safeParse({}).success).toBe(false);
  });

  it('marks a thread handled or open with an explicit value only', () => {
    expect(setReviewThreadHandledSchema.parse({ handled: false })).toEqual({ handled: false });
    expect(setReviewThreadHandledSchema.safeParse({}).success).toBe(false);
    expect(setReviewThreadHandledSchema.safeParse({ handled: 'true' }).success).toBe(false);
  });

  it('lists review threads by part and by state, a bounded page at a time', () => {
    expect(listReviewThreadsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      listReviewThreadsQuerySchema.parse({ section: 'financial', state: 'open', pageSize: '50' }),
    ).toEqual({ page: 1, pageSize: 50, section: 'financial', state: 'open' });
    expect(listReviewThreadsQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(listReviewThreadsQuerySchema.safeParse({ state: 'closed' }).success).toBe(false);
    expect(listReviewThreadsQuerySchema.safeParse({ section: 'x' }).success).toBe(false);
  });
});
