# ADR-0010: Feasibility platform

- Status: Proposed
- Date: 2026-10-02

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

## Consequences

- The applicant and the company work in one place with a full, audited history.
- More tables and a PDF renderer in the API image (fonts and a headless renderer or a PDF library; chosen in the deliverable story by measured image size and Persian shaping quality).
- Business decisions slot in without schema rewrites: pricing and contracts are already explicit steps.

## Alternatives considered

- **Keep extending `ServiceRequest`.** Its status model and fields cannot hold questionnaires, experts and deliverables. Rejected.
- **Hard-coded questionnaire per sector.** Every content change would need a deploy. Rejected.
- **Generating the report as an editable Word file only.** Not tamper-evident and hard to version. Word export may be added later; PDF is the delivered artefact.
