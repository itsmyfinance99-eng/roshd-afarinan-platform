import { FEASIBILITY_STATUSES } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import { toCsv } from '../../../common/csv/csv';
import {
  daysIn,
  PIPELINE_EXPORT_HEADER,
  pipelineExportFileName,
  pipelineExportRow,
  pipelineSummary,
} from './pipeline';

const now = new Date('2026-10-08T12:00:00Z');
const ago = (days: number, hours = 0) =>
  new Date(now.getTime() - (days * 24 + hours) * 60 * 60 * 1000);

describe('feasibility pipeline', () => {
  it('counts whole days and never goes below zero', () => {
    expect(daysIn(ago(0, 23), now)).toBe(0);
    expect(daysIn(ago(1), now)).toBe(1);
    expect(daysIn(ago(9, 23), now)).toBe(9);
    // A status stamped by a clock ahead of this one.
    expect(daysIn(new Date(now.getTime() + 60_000), now)).toBe(0);
  });

  it('lists every status in the order of the workflow, with the age of its projects', () => {
    const summary = pipelineSummary(
      [
        { status: 'IN_PROGRESS', statusSince: ago(10) },
        { status: 'SUBMITTED', statusSince: ago(2, 5) },
        { status: 'IN_PROGRESS', statusSince: ago(3) },
        { status: 'IN_PROGRESS', statusSince: ago(0, 1) },
      ],
      now,
    );
    expect(summary.total).toBe(4);
    expect(summary.stages.map((stage) => stage.status)).toEqual([...FEASIBILITY_STATUSES]);
    const stage = (status: string) => summary.stages.find((s) => s.status === status);
    expect(stage('IN_PROGRESS')).toEqual({
      status: 'IN_PROGRESS',
      count: 3,
      oldestSince: ago(10),
      longestDays: 10,
      // (10 + 3 + 0) / 3
      averageDays: 4.3,
    });
    expect(stage('SUBMITTED')).toMatchObject({ count: 1, longestDays: 2, averageDays: 2 });
    // A status without a project has no age; it is not zero days old.
    expect(stage('DELIVERED')).toEqual({
      status: 'DELIVERED',
      count: 0,
      oldestSince: null,
      longestDays: null,
      averageDays: null,
    });
  });

  it('gives an empty pipeline for no projects', () => {
    const summary = pipelineSummary([], now);
    expect(summary.total).toBe(0);
    expect(summary.stages.every((stage) => stage.count === 0 && stage.averageDays === null)).toBe(
      true,
    );
  });

  it('maps a project to labelled, injection-safe cells', () => {
    const row = pipelineExportRow(
      {
        code: 'FP-7K3M9QPD',
        title: '=HYPERLINK("http://evil","x")',
        sector: 'معدنی',
        location: null,
        status: 'EXPERT_REVIEW',
        statusSince: new Date('2026-09-11T08:00:00Z'),
        createdAt: new Date('2026-09-01T08:00:00Z'),
        applicant: '+متقاضی, نمونه',
        experts: ['کارشناس یک', '@کارشناس دو'],
      },
      new Date('2026-09-14T09:00:00Z'),
    );
    const line = toCsv(PIPELINE_EXPORT_HEADER, [row]).split('\r\n')[1];
    expect(line).toBe(
      'FP-7K3M9QPD,"\'=HYPERLINK(""http://evil"",""x"")",معدنی,,بازبینی کارشناس,1405/06/20 11:30,3,"\'+متقاضی, نمونه",کارشناس یک؛ @کارشناس دو,1405/06/10 11:30',
    );
    // A list of experts that starts with a formula character is neutralised as a whole.
    const first = pipelineExportRow(
      {
        code: 'FP-00000000',
        title: 'طرح',
        sector: null,
        location: '-یزد',
        status: 'DRAFT',
        statusSince: now,
        createdAt: now,
        applicant: null,
        experts: ['=1+1'],
      },
      now,
    );
    expect(toCsv(PIPELINE_EXPORT_HEADER, [first]).split('\r\n')[1]).toContain(",'-یزد,");
    expect(toCsv(PIPELINE_EXPORT_HEADER, [first]).split('\r\n')[1]).toContain(",'=1+1,");
  });

  it('builds an ASCII file name stamped in Iran time', () => {
    expect(pipelineExportFileName(new Date('2026-09-25T21:00:00Z'))).toBe(
      'feasibility-projects-20260926-0030.csv',
    );
  });
});
