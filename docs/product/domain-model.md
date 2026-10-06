# Domain Model

Bounded contexts and their main entities. **Bold** entities are implemented in Phase 0–1. The rest are reserved names. Their contracts come later.

## Identity & Access

- **User**: one identity per person, however many roles they hold (student + applicant + investor on one account).
- **Role**: `guest`, `user`, `student`, `applicant`, `investor`, `expert`, `instructor`, `editor`, `support`, `finance`, `admin`, `super_admin`.
- **Permission**: `resource:action` strings (e.g. `cms.article:publish`).
- **UserRole**, **RefreshToken** (session), MFA settings (flag only).
- **AuditLog**: actor, action, entity type/id, metadata, IP, user agent, request ID, timestamp.

## CMS

- **Page**: institutional pages with structured sections and SEO.
- **Article**: publication-oriented, dated content.
- **KnowledgeArticle**: structured reference content (encyclopedia). Kept separate from Article on purpose (it helps semantic search and RAG later).
- **Category** (scoped: article / knowledge / course / research), **Tag**, **Author**, **Media**.
- **SeoMeta** (embedded fields): metaTitle, metaDescription, canonicalUrl, ogImage, noIndex, structured-data type.
- Publication status: `DRAFT → PUBLISHED → ARCHIVED`. Only `PUBLISHED` content is public.

## Learning (Phase 1: catalog; Phase 2: LMS)

- **Course**, **CourseCategory** (via Category), **Instructor**.
- Reserved: Module, Lesson, Enrollment, Progress, Quiz, Question, Assignment, Certificate, Coupon, Review.

## Research

- **ResearchProject**: public portfolio/research outputs (title, sector, summary, year, status).
- Research orders are **ServiceRequest** with type `RESEARCH`.

## Consulting & Service Requests

- **ServiceRequest**: type (`FEASIBILITY`, `RESEARCH`, `CONSULTING`, `TRAINING`, `INVESTMENT`, `CONTACT`), status (`NEW → IN_REVIEW → RESPONDED → CLOSED`), requester (user or guest contact), subject, message, optional attachments.
- Phase 1 captures requests only. Pricing, contracts and booking are open questions.

## Ticketing

- **Ticket** (subject, status `OPEN → PENDING → ANSWERED → CLOSED`, priority), **TicketMessage** (author, body, internal flag).

## Files

- **FileObject**: owner, purpose, entity type/id, accessLevel (`PUBLIC`/`PRIVATE`), MIME, size, SHA-256 checksum, storage key, version, status. It never lives in the web root.

## Orders & Payments

- **Order**: user, items, total amount (Rials, integer), status (`PENDING → PAID | CANCELLED | EXPIRED`).
- **OrderItem**: itemType, itemId, title snapshot, price snapshot.
- **PaymentAttempt**: order, provider, amount, status (`INITIATED → REDIRECTED → VERIFIED | FAILED`), provider reference, idempotency key.
- The `PaymentGateway` port hides the provider.

## Investment (Phase 1: catalog only)

- **InvestmentOpportunity**: name, sector, location, summary, capacity, financing method, status, isDemo. Figures appear only when real data is supplied.
- Reserved: ProjectMetric, FinancingNeed, FinancialScenario, ProjectDocument, ProjectMedia, Watchlist.

## Feasibility (Phase 3; ADR-0010)

- **FeasibilityProject** (ST-35.01): code (`FP-…`), applicant, title, sector, location, summary, status, optional financial model (EPIC-34; a linked model cannot be deleted) and optional source `ServiceRequest`.
- **FeasibilityStatusEvent**: from, to, capacity of the actor (`applicant`, `staff`, `expert`, `system`), user, note; written once per transition and never updated.
- **ExpertAssignment**: project, expert, who assigned it, and who ended it and when; active while not ended, kept as history afterwards.
- The status changes only through the state machine: `DRAFT → SUBMITTED → INITIAL_REVIEW → NEEDS_MORE_INFO → COST_ESTIMATED → CONTRACT_PENDING → IN_PROGRESS → EXPERT_REVIEW → CLIENT_REVIEW → DELIVERED → ARCHIVED`.
- Still to come: QuestionnaireTemplate, QuestionnaireResponse, project documents, CostEstimate, ReviewComment, Deliverable.

## Future integrations

- **Financial Engine** (Phase 4): pure calculation ports (NPV, IRR, MIRR, payback, DSCR, break-even, WACC, scenarios, sensitivity).
- **Iran Sahamdar** (Phase 6): `IranSahamdarClient` port + mock.
- **AI** (Phase 7): `AiProvider`, `RetrievalProvider` ports. Authorization before retrieval.
- **Blockchain** (Phase 8): `BlockchainNetworkAdapter`, `WalletProvider` ports. No network or token standard is assumed.

## AI-ready metadata (from day one)

Documents: `id`, `ownerId`, `entityType/entityId` (project), `purpose` (document type), `version`, `createdAt` (uploaded_at), `source`, `accessLevel` (visibility), `checksum`.
Content: author, category, tags, status, sources/references.
