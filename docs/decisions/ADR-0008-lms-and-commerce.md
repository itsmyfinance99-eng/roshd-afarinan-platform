# ADR-0008: LMS and commerce (Phase 2)

- Status: Proposed
- Date: 2026-10-02

## Context

Phase 1 ships a course catalog, orders with server-verified payments behind `PaymentGateway`, and a mock gateway. A paid order today changes nothing else: nobody is enrolled, and courses have no lessons. Phase 2 ("LMS & Commerce", [phase-2-plan.md](../product/phase-2-plan.md)) adds a basic LMS (curriculum, enrollment, progress) and completes the purchase flow.

Forces:

- `orders` already depends on `learning` (it reads course prices), so `learning` cannot call back into `orders` without a module cycle.
- A payment is verified once; whatever must happen after it (enrollment, notifications) must not be lost if it fails halfway, and must not happen twice.
- Lesson media (mostly video) is private, larger than the 8 MB upload limit, and the hosting choice is open (OQ-26).
- Several business rules are undecided: access duration (OQ-27), certificates (OQ-03), refunds (OQ-23), reviews (OQ-28), in-person sessions (OQ-30), coupons (OQ-31), instructor rights (OQ-33). The model must work with conservative defaults and change by configuration or a small migration when decisions arrive.

## Decision

1. **Ownership.** `learning` owns `CourseSection`, `Lesson`, `Enrollment` and `LessonProgress`. `orders` owns orders, payment attempts and fulfillment. No module reads another module's tables.
2. **Fulfillment through an outbox in `orders`.** When an order becomes `PAID`, the same transaction writes one `OrderFulfillment` row per item (`PENDING`). A processor runs the handler for each item kind and marks the row `DONE` or `FAILED` with a retry count; the maintenance scheduler retries `FAILED`/stale rows with backoff. Handlers are idempotent (a unique `(userId, courseId)` enrollment, upsert semantics).
3. **Handlers via an exported service, not events.** `orders` defines a `FulfillmentHandler` interface keyed by `OrderItemKind`; the `COURSE` handler calls `LearningService.enrollFromOrder(...)`, which `learning` already exports. Dependency direction stays `orders → learning`. We do not add an event bus for one consumer.
4. **One access policy.** A pure domain function in `learning` (`canAccessLesson(principal, lesson, enrollment, now)`) decides access: preview lessons are public, everything else needs an `ACTIVE`, non-expired enrollment, staff with `catalog:manage` can always preview. Every lesson and lesson-media endpoint goes through it, and negative authorization tests cover it.
5. **Enrollment sources.** `FREE` (self-enroll in a free published course), `ORDER` (fulfillment), `MANUAL` (staff, audited). `expiresAt` is nullable; until OQ-27 is decided it stays null.
6. **Lesson media behind a port.** `VideoHostingProvider` (`getPlayback(lessonAsset, viewer) → { url, expiresAt, mime }`) with a first adapter on top of `FileStorageProvider`: private object, short-lived signed URL, HTTP Range support. A new `FilePurpose.LESSON_ASSET` has its own size limit (configuration) and is uploadable only with `catalog:manage`. A VOD service can replace the adapter after OQ-26 without touching the domain.
7. **Undecided rules stay off.** Reviews are pre-moderated and not shown publicly until OQ-28 is decided (a configuration flag). Certificates, refunds, coupons, sessions and instructor rights are separate stories blocked on their decisions; no code guesses them.
8. **Reconciliation.** A scheduled job re-verifies `INITIATED` attempts older than a configured age through `PaymentGateway.verify` (the port contract already requires idempotent verify). Automatic expiry of unpaid orders is implemented but disabled by default (OQ-34).

## Consequences

- Paying for a course reliably produces exactly one enrollment, even if the API restarts between payment and enrollment.
- `orders` keeps a small table and a processor; `learning` gains four tables and a curriculum editor.
- Real providers (PSP, SMS, VOD) remain adapter stories that can land independently when OQ-09, OQ-08 and OQ-26 are answered.
- If a second consumer of "order paid" appears (e.g. notifications with many channels), revisit decision 3 and introduce in-process domain events.

## Alternatives considered

- **`@nestjs/event-emitter` "order.paid" event, learning subscribes.** Decouples modules, but in-memory events are lost on crash and would need an outbox anyway. Rejected for now (decision 3).
- **Enroll inside the payment transaction.** Simplest, but couples payment verification to learning and fails the payment write if enrollment fails. Rejected.
- **Store videos on a public CDN path.** Breaks the "never expose private files" rule. Rejected.
