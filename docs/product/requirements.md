# Requirements (MVP — Phase 0 & 1)

The source is the project roadmap/RFP summary. IDs map to backlog stories.

## Business goals

1. Present the company as a trustworthy, specialised institution (50+ experts, active since 1388, training/research/consulting).
2. Route an anonymous visitor into one of four journeys: Training, Feasibility, Research, Iran Sahamdar.
3. Capture qualified service requests (feasibility, research, consulting, training, investment, contact).
4. Let the company team manage content, users, requests, files and tickets.
5. Build the core (identity, content, files, payments, notifications, audit, search, permissions) once and reuse it across all later modules.

## MVP success criteria (roadmap §34)

An anonymous user can:

- land on the home page and reach one of the four journeys,
- search content and services,
- register and sign in,
- browse the course catalog (purchase flow lands in Phase 2; the order/payment abstraction is ready),
- submit a service request and attach files,
- see their request status in the dashboard,
- open and follow a support ticket.

Company staff can manage content, users (roles), requests, files and tickets.

## Non-functional

| Area          | Requirement                                                              |
| ------------- | ------------------------------------------------------------------------ |
| Language      | Persian, RTL, Persian digits in UI                                       |
| Responsive    | Mobile-first. Breakpoints: 640 / 768 / 1024 / 1280                       |
| Performance   | LCP < 2.5s on 4G for public pages. Public pages are ISR/SSG              |
| SEO           | Metadata, canonical, OG, JSON-LD, sitemap, robots                        |
| Accessibility | WCAG 2.1 AA: semantic HTML, keyboard navigation, focus visible, contrast |
| Security      | See `docs/security/security-baseline.md`                                 |
| Portability   | Docker images. No vendor lock-in. Providers behind adapters              |
| Observability | Structured logs, request ID, health/readiness                            |
| Ownership     | The client owns the source code, database, files and business data       |

## Out of scope for MVP

See `docs/product/implementation-plan.md` §7.
