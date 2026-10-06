# ADR-0010: Feasibility platform

- Status: Accepted
- Date: 2026-10-02 (accepted 2026-10-06 with ST-35.01)

## Context

Today a feasibility request is a `ServiceRequest` of type `FEASIBILITY`: a form, a tracking code and a staff status. Phase 1 also defined the workflow contract, a pure state machine in `apps/api/src/modules/feasibility/domain/feasibility-status.ts` (`DRAFT → SUBMITTED → … → DELIVERED → ARCHIVED`, with actor rules). Phase 3 turns this into a platform where the applicant fills a questionnaire and uploads documents, staff estimate and contract the work, experts build the study with the financial engine (ADR-0009), and the client receives a versioned report.

Open business points: pricing (OQ-01), contract and staged payment (OQ-02), document confidentiality (OQ-07). Answered by the owner on 2026-10-02: the report follows the UNIDO methodology with COMFAR financials (OQ-35); questionnaires and document lists are prepared by the feasibility officer and the admin, and the applicant adds project-specific items (OQ-36); the report is approved first by the feasibility officer, then by the site admin (OQ-37).

## Decision

1. **A `feasibility` module** owns `FeasibilityProject`, `FeasibilityStatusEvent`, `QuestionnaireTemplate` (versioned), `QuestionnaireResponse`, `ProjectDocument` links, `ExpertAssignment`, `ReviewComment`, `CostEstimate` and `Deliverable`. It uses `files`, `notifications`, `audit` and `financial-model` only through their exported services.
2. **Roles.** A new role, feasibility officer (`feasibility_officer`), holds `feasibility:manage` and `feasibility:approve-report`; admins and super admins hold `feasibility:final-approve`.
3. **The state machine is the only way to change status.** Every transition goes through `transition()`, writes a status event with actor and note, is audited, and notifies the parties. Actors map to permissions: applicant = project owner; staff = `feasibility:manage`; expert = an active `ExpertAssignment` on that project.
4. **Questionnaires are data, not code.** The feasibility officer and the admin author templates and document lists per sector (sections, question types: text, long text, number with unit, single/multiple choice, date, table, file). A project pins the template version it started with, so later edits never change submitted answers. Answers are locked at submission and reopened only by `NEEDS_MORE_INFO`. A project may also carry project-specific questions, notes and required documents added by the applicant, the feasibility officer or the admin; each item records who added it.
5. **Access is per project.** Owner, staff with `feasibility:manage` and assigned experts only. Documents are private files of purpose `FEASIBILITY_DOCUMENT`, served by signed, expiring URLs; investors and the public never see them (OQ-05, OQ-07). Negative authorization tests cover every endpoint.
6. **The financial model lives in its own module (`financial-model`)**, linked to the project, edited by assigned experts, calculated by `@roshd/financial-engine`. The applicant may be invited to enter data in it (owner decision per project), but approval belongs to the expert.
7. **Commercial steps stay manual until decided.** Staff enter the cost estimate as numbers they decide (OQ-01). Contracting is "upload signed contract + staff confirms" (OQ-02). No online payment for studies until OQ-02 and OQ-09 are answered; the `orders` module can gain a `FEASIBILITY_STUDY` item kind later.
8. **Deliverables are immutable versions with two-step approval.** A deliverable follows the UNIDO chapter structure (configurable in the report template) and combines expert-written sections (Markdown), selected questionnaire answers and an **approved** financial-model run whose COMFAR schedules and, when done, economic analysis form the financial and economic chapters. It is approved first by the feasibility officer and then by an admin, in that order only; a rejection at either step returns it to drafting as a new version. Both approvals (name, time) appear on the report and in the audit log, and the applicant receives it only after the admin's approval. Rendering produces a Persian RTL PDF with self-hosted fonts on the server; each version is stored as a private file with its own hash. Delivered versions are never edited; a correction is a new version.
9. **Migration path.** Staff can convert an existing `FEASIBILITY` service request into a project (copying contact data and attachments), so Phase 1 requests are not lost.

## As built in ST-35.01

- **Tables.** `feasibility_projects` (code `FP-…`, applicant, title, sector, location, summary, status, optional `financialModelId` and `sourceRequestId`, both unique), `feasibility_status_events` (from, to, capacity of the actor, user, note) and `expert_assignments` (project, expert, who assigned and who ended it). The other entities of §1 arrive with their stories.
- **Permissions.** `feasibility:manage` (staff: every project, staff transitions, experts), `feasibility:work` (may be assigned as an expert; held by the `expert` role), `feasibility:approve-report` and `feasibility:final-approve`. The feasibility officer holds the first and the third; only admins and super admins hold the last.
- **One capacity on one's own project.** On a project they own, a user is the applicant and nothing else: staff rights do not count there and the applicant cannot be assigned as its expert. Elsewhere a user who is both staff and an assigned expert acts in the first capacity the rules accept, and that capacity is stored with the event.
- **Transitions.** `POST /api/v1/feasibility-projects/:id/transitions` is the only writer of `status`. The update is conditional on the status that was read and is written in one transaction with its event, so two concurrent requests cannot both apply a step. A step that does not exist is a 409, a step of another party a 403, and a project the caller has no relation to a 404. Status events are immutable in the database (trigger). The note of a transition is addressed to the other parties and all of them read it; the applicant sees the capacity of who acted, staff and experts also see the name.
- **Preconditions of later steps.** The state machine decides who may take a step. What a step needs beyond that (a cost estimate before `COST_ESTIMATED`, a signed contract before `IN_PROGRESS`, the two approvals before `DELIVERED`) is checked in the same `transition()` by the stories that introduce those records; no web page offers these steps before then.
- **Experts.** Several experts can work on a project, all with the same rights; an assignment is active until it is ended and is kept as history afterwards. A lead-expert role is not modelled until a rule needs it. Access needs both the active assignment and the `feasibility:work` permission.
- **Financial model.** The link is the foreign key on the project (`RESTRICT`): a model that belongs to a project cannot be deleted. Creating the model for a project and opening it to the assigned experts is ST-35.10; until then a model is still reached through its own owner and assignee (ADR-0009 §6).
- **Notifications.** A new status is announced to the applicant (in-app and e-mail), to the assigned experts, and to the staff when the applicant or an expert acted; never to the person who acted. A draft is announced to nobody.

## Consequences

- The applicant and the company work in one place with a full, audited history.
- More tables and a PDF renderer in the API image (fonts and a headless renderer or a PDF library; chosen in the deliverable story by measured image size and Persian shaping quality).
- Business decisions slot in without schema rewrites: pricing and contracts are already explicit steps.

## Alternatives considered

- **Keep extending `ServiceRequest`.** Its status model and fields cannot hold questionnaires, experts and deliverables. Rejected.
- **Hard-coded questionnaire per sector.** Every content change would need a deploy. Rejected.
- **Generating the report as an editable Word file only.** Not tamper-evident and hard to version. Word export may be added later; PDF is the delivered artefact.
