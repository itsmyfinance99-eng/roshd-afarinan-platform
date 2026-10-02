# ADR-0010: Feasibility platform

- Status: Proposed
- Date: 2026-10-02

## Context

Today a feasibility request is a `ServiceRequest` of type `FEASIBILITY`: a form, a tracking code and a staff status. Phase 1 also defined the workflow contract, a pure state machine in `apps/api/src/modules/feasibility/domain/feasibility-status.ts` (`DRAFT → SUBMITTED → … → DELIVERED → ARCHIVED`, with actor rules). Phase 3 turns this into a platform where the applicant fills a questionnaire and uploads documents, staff estimate and contract the work, experts build the study with the financial engine (ADR-0009), and the client receives a versioned report.

Open business points: pricing (OQ-01), contract and staged payment (OQ-02), document confidentiality (OQ-07), report methodology and format (OQ-35), questionnaire content per sector (OQ-36), report sign-off (OQ-37).

## Decision

1. **A `feasibility` module** owns `FeasibilityProject`, `FeasibilityStatusEvent`, `QuestionnaireTemplate` (versioned), `QuestionnaireResponse`, `ProjectDocument` links, `ExpertAssignment`, `ReviewComment`, `CostEstimate` and `Deliverable`. It uses `files`, `notifications`, `audit` and `financial-model` only through their exported services.
2. **The state machine is the only way to change status.** Every transition goes through `transition()`, writes a status event with actor and note, is audited, and notifies the parties. Actors map to permissions: applicant = project owner; staff = `feasibility:manage`; expert = an active `ExpertAssignment` on that project.
3. **Questionnaires are data, not code.** Staff author templates (sections, question types: text, long text, number with unit, single/multiple choice, date, table, file). A project pins the template version it started with, so later edits never change submitted answers. Answers are locked at submission and reopened only by `NEEDS_MORE_INFO`.
4. **Access is per project.** Owner, staff with `feasibility:manage` and assigned experts only. Documents are private files of purpose `FEASIBILITY_DOCUMENT`, served by signed, expiring URLs; investors and the public never see them (OQ-05, OQ-07). Negative authorization tests cover every endpoint.
5. **The financial model lives in its own module (`financial-model`)**, linked to the project, edited by assigned experts, calculated by `@roshd/financial-engine`. The applicant may be invited to enter data in it (owner decision per project), but approval belongs to the expert.
6. **Commercial steps stay manual until decided.** Staff enter the cost estimate as numbers they decide (OQ-01). Contracting is "upload signed contract + staff confirms" (OQ-02). No online payment for studies until OQ-02 and OQ-09 are answered; the `orders` module can gain a `FEASIBILITY_STUDY` item kind later.
7. **Deliverables are immutable versions.** A deliverable combines expert-written sections (Markdown), selected questionnaire answers and an **approved** financial-model run. Rendering produces a Persian RTL PDF with self-hosted fonts on the server; each version is stored as a private file with its own hash. Delivered versions are never edited; a correction is a new version.
8. **Migration path.** Staff can convert an existing `FEASIBILITY` service request into a project (copying contact data and attachments), so Phase 1 requests are not lost.

## Consequences

- The applicant and the company work in one place with a full, audited history.
- More tables and a PDF renderer in the API image (fonts and a headless renderer or a PDF library; chosen in the deliverable story by measured image size and Persian shaping quality).
- Business decisions slot in without schema rewrites: pricing and contracts are already explicit steps.

## Alternatives considered

- **Keep extending `ServiceRequest`.** Its status model and fields cannot hold questionnaires, experts and deliverables. Rejected.
- **Hard-coded questionnaire per sector.** Every content change would need a deploy. Rejected.
- **Generating the report as an editable Word file only.** Not tamper-evident and hard to version. Word export may be added later; PDF is the delivered artefact.
