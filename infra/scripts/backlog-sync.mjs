#!/usr/bin/env node
/**
 * Idempotently syncs docs/backlog/backlog.yaml (+ docs/product/open-questions.md)
 * to GitHub: labels, milestones, epic/story issues, sub-issue links and open questions.
 *
 * Usage:  pnpm backlog:sync [--dry-run]
 * Requires: authenticated `gh` CLI with `repo` scope, run inside the repository.
 *
 * Issues are matched by the hidden marker `<!-- backlog-id: ID -->` in the body,
 * so titles may be edited on GitHub without creating duplicates.
 * A story with `status: done` in backlog.yaml is closed on GitHub.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dryRun = process.argv.includes('--dry-run');
const backlog = parse(readFileSync(resolve(root, 'docs/backlog/backlog.yaml'), 'utf8'));
const openQuestionsMd = readFileSync(resolve(root, 'docs/product/open-questions.md'), 'utf8');

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function gh(args, input) {
  return execFileSync('gh', args, {
    cwd: root,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

function mutate(description, fn) {
  if (dryRun) {
    console.log(`[dry-run] ${description}`);
    return null;
  }
  console.log(description);
  const result = fn();
  sleep(700); // stay well below GitHub secondary rate limits
  return result;
}

const repo = ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
console.log(`Syncing backlog → ${repo}${dryRun ? ' (dry run)' : ''}`);

// ── labels ────────────────────────────────────────────────────────────────
const existingLabels = new Map(
  ghJson(['label', 'list', '--limit', '500', '--json', 'name,color,description']).map((l) => [
    l.name,
    l,
  ]),
);
for (const label of backlog.labels) {
  const current = existingLabels.get(label.name);
  if (
    current &&
    current.color.toLowerCase() === label.color.toLowerCase() &&
    (current.description ?? '') === label.description
  ) {
    continue;
  }
  mutate(`label: ${label.name}`, () =>
    gh([
      'label',
      'create',
      label.name,
      '--color',
      label.color,
      '--description',
      label.description,
      '--force',
    ]),
  );
}

// ── milestones ────────────────────────────────────────────────────────────
const milestoneByKey = new Map();
const existingMilestones = ghJson([
  'api',
  `repos/${repo}/milestones?state=all&per_page=100`,
]);
for (const m of backlog.milestones) {
  const current = existingMilestones.find((x) => x.title === m.title);
  const dueOn = m.due ? `${m.due}T20:30:00Z` : undefined;
  if (!current) {
    const args = ['api', '-X', 'POST', `repos/${repo}/milestones`, '-f', `title=${m.title}`];
    if (m.description) args.push('-f', `description=${m.description}`);
    if (dueOn) args.push('-f', `due_on=${dueOn}`);
    mutate(`milestone: ${m.title}`, () => gh(args));
  } else if ((current.description ?? '') !== (m.description ?? '')) {
    mutate(`milestone (update): ${m.title}`, () =>
      gh([
        'api',
        '-X',
        'PATCH',
        `repos/${repo}/milestones/${current.number}`,
        '-f',
        `description=${m.description ?? ''}`,
      ]),
    );
  }
  milestoneByKey.set(m.key, m.title);
}

// ── issues ────────────────────────────────────────────────────────────────
const MARKER = /<!-- backlog-id: ([A-Z0-9.-]+) -->/;
const existingIssues = new Map();
for (const issue of ghJson([
  'issue',
  'list',
  '--state',
  'all',
  '--limit',
  '2000',
  '--json',
  'number,title,body,state,labels,milestone,id',
])) {
  const match = issue.body?.match(MARKER);
  if (match) existingIssues.set(match[1], issue);
}

function upsertIssue({ id, title, body, labels, milestone, closed }) {
  const fullBody = `${body}\n\n<!-- backlog-id: ${id} -->`;
  const current = existingIssues.get(id);
  if (!current) {
    const args = ['issue', 'create', '--title', title, '--body-file', '-'];
    for (const l of labels) args.push('--label', l);
    if (milestone) args.push('--milestone', milestone);
    const url = mutate(`issue (create): ${title}`, () => gh(args, fullBody));
    if (!url) return null;
    const number = Number(url.split('/').pop());
    const created = ghJson(['issue', 'view', String(number), '--json', 'number,id,state']);
    existingIssues.set(id, { ...created, title, body: fullBody });
    if (closed) mutate(`issue (close): #${number}`, () => gh(['issue', 'close', String(number)]));
    return existingIssues.get(id);
  }

  const edit = ['issue', 'edit', String(current.number)];
  let changed = false;
  if (current.title !== title) {
    edit.push('--title', title);
    changed = true;
  }
  if ((current.body ?? '').trim() !== fullBody.trim()) {
    edit.push('--body-file', '-');
    changed = true;
  }
  const currentLabels = new Set((current.labels ?? []).map((l) => l.name));
  for (const l of labels) {
    if (!currentLabels.has(l)) {
      edit.push('--add-label', l);
      changed = true;
    }
  }
  if (milestone && current.milestone?.title !== milestone) {
    edit.push('--milestone', milestone);
    changed = true;
  }
  if (changed) mutate(`issue (update): #${current.number} ${title}`, () => gh(edit, fullBody));

  if (closed && current.state === 'OPEN') {
    mutate(`issue (close): #${current.number}`, () =>
      gh(['issue', 'close', String(current.number), '--reason', 'completed']),
    );
  }
  return current;
}

const phaseLabel = (phase) => (phase === 0 || phase === 1 ? `phase:${phase}` : 'phase:future');
const dodLink = 'docs/product/implementation-plan.md (بخش ۶ — Definition of Done)';

// 1) epics first (without the story checklist), so stories can reference them
const epicIssues = new Map();
for (const epic of backlog.epics) {
  const issue = upsertIssue({
    id: epic.id,
    title: `[${epic.id}] ${epic.title}`,
    body: `### هدف\n${epic.goal}\n\n_Storyها پس از همگام‌سازی به این اپیک لینک می‌شوند._`,
    labels: ['type:epic', `priority:${epic.priority}`, phaseLabel(epic.phase)],
  });
  epicIssues.set(epic.id, issue);
}

// 2) stories
for (const epic of backlog.epics) {
  const epicIssue = epicIssues.get(epic.id);
  for (const story of epic.stories) {
    const milestone = milestoneByKey.get(story.sprint);
    const body = [
      `**Epic:** ${epicIssue ? `#${epicIssue.number}` : epic.id} — ${epic.title}`,
      `**Sprint:** ${milestone ?? story.sprint} · **Points:** ${story.points} · **Priority:** ${story.priority}`,
      '',
      '### User story',
      story.story,
      '',
      '### Acceptance criteria',
      ...story.acceptance.map((a) => `- [${story.status === 'done' ? 'x' : ' '}] ${a}`),
      '',
      '### Definition of Done',
      `طبق ${dodLink}`,
    ].join('\n');
    const labels = [
      'type:story',
      `priority:${story.priority}`,
      phaseLabel(story.sprint?.startsWith('P') ? 'future' : epic.phase),
      ...(story.area ?? []).map((a) => `area:${a}`),
    ];
    upsertIssue({
      id: story.id,
      title: `[${story.id}] ${story.title}`,
      body,
      labels,
      milestone,
      closed: story.status === 'done',
    });
  }
}

// 3) epic bodies with story checklist + native sub-issues
for (const epic of backlog.epics) {
  const epicIssue = epicIssues.get(epic.id);
  if (!epicIssue) continue;
  const lines = epic.stories.map((s) => {
    const issue = existingIssues.get(s.id);
    const done = s.status === 'done' ? 'x' : ' ';
    return `- [${done}] ${issue ? `#${issue.number}` : s.id} ${s.id} — ${s.title} (${s.points} pt, ${s.sprint})`;
  });
  const totalPoints = epic.stories.reduce((sum, s) => sum + s.points, 0);
  const donePoints = epic.stories
    .filter((s) => s.status === 'done')
    .reduce((sum, s) => sum + s.points, 0);
  upsertIssue({
    id: epic.id,
    title: `[${epic.id}] ${epic.title}`,
    body: [
      '### هدف',
      epic.goal,
      '',
      `### Storyها (${donePoints}/${totalPoints} امتیاز انجام‌شده)`,
      ...lines,
    ].join('\n'),
    labels: ['type:epic', `priority:${epic.priority}`, phaseLabel(epic.phase)],
    closed: epic.stories.every((s) => s.status === 'done'),
  });

  if (dryRun) continue;
  let linked = new Set();
  try {
    linked = new Set(
      ghJson(['api', `repos/${repo}/issues/${epicIssue.number}/sub_issues?per_page=100`]).map(
        (i) => i.number,
      ),
    );
  } catch {
    continue; // sub-issues API unavailable; checklist is enough
  }
  for (const s of epic.stories) {
    const child = existingIssues.get(s.id);
    if (!child || linked.has(child.number)) continue;
    try {
      const childId = ghJson(['api', `repos/${repo}/issues/${child.number}`]).id;
      mutate(`sub-issue: #${epicIssue.number} ← #${child.number}`, () =>
        gh([
          'api',
          '-X',
          'POST',
          `repos/${repo}/issues/${epicIssue.number}/sub_issues`,
          '-F',
          `sub_issue_id=${childId}`,
        ]),
      );
    } catch (error) {
      console.warn(`  (sub-issue link skipped: ${error.message.split('\n')[0]})`);
    }
  }
}

// 4) open questions → needs:decision issues
for (const line of openQuestionsMd.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (!cells[1]?.startsWith('OQ-')) continue;
  const [, id, topic, question, impact, interim, status] = cells;
  upsertIssue({
    id,
    title: `[${id}] ${topic}`,
    body: [
      '### سؤال',
      question,
      '',
      `**اثر بر:** ${impact}`,
      `**راهکار موقت تا تصمیم:** ${interim}`,
      '',
      'پس از تصمیم، پاسخ را در `docs/product/open-questions.md` و ADR مرتبط ثبت کنید.',
    ].join('\n'),
    labels: ['type:spike', 'needs:decision'],
    closed: status && status !== 'باز',
  });
}

console.log('Backlog sync complete.');
