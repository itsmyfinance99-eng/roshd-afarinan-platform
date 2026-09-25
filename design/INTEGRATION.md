# Claude Design handoff: integration map

- **Source:** Claude Design project `5c1ac6ab-902c-4365-8c80-3d445afff738` (handoff bundle `Roshd-handoff.zip`, imported 2026-09-25)
- **Raw files:** [`design/claude-design/`](claude-design/) is kept **verbatim** as the visual reference. Do not edit it. Re-import a new handoff over it.
- **Story:** ST-04.07. **Target:** `apps/web` (Next.js) + `packages/ui`.

The prototype is HTML plus the Claude Design runtime (`support.js`, which loads React from unpkg and compiles `<x-dc>` templates). We **recreate** the visuals in Next.js/Tailwind. We do not ship the runtime, the unpkg scripts or the Google Fonts link. Fonts are self-hosted (see OQ/ADR-0005).

## Route mapping

| Prototype file                            | Next.js route                                            | Data source (Phase 1)                            |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `Home.dc.html`                            | `/`                                                      | content layer + CMS/catalog APIs                 |
| `About.dc.html`                           | `/about`                                                 | content layer (→ CMS Page)                       |
| `Services.dc.html` (nav label "مشاوره")   | `/consulting` (+ `/services` overview)                   | content layer                                    |
| `Training.dc.html`                        | `/training`                                              | `GET /api/v1/courses`                            |
| `Feasibility.dc.html` (+ `#request` form) | `/feasibility`, `/feasibility/request`                   | `POST /api/v1/service-requests`                  |
| `Research.dc.html`                        | `/research`                                              | `GET /api/v1/research`                           |
| `Investment.dc.html`                      | `/investment`                                            | `GET /api/v1/investments`                        |
| `Iran Sahamdar.dc.html`                   | `/iran-sahamdar`                                         | content layer (no integration)                   |
| `Knowledge.dc.html`                       | `/knowledge`                                             | `GET /api/v1/knowledge`                          |
| `Articles.dc.html`                        | `/articles`                                              | `GET /api/v1/articles`                           |
| `Contact.dc.html`                         | `/contact`                                               | `POST /api/v1/service-requests` (type `CONTACT`) |
| Auth modal in `SiteHeader`                | `/login`, `/register` (dedicated pages) + optional modal | `POST /api/v1/auth/*`                            |
| Search overlay in `SiteHeader`            | overlay + `/search`                                      | `GET /api/v1/search`                             |

## Component mapping

| Prototype component                                                    | Target                                                                           | Notes                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SiteHeader`                                                           | `apps/web/src/components/layout/site-header.tsx` (client island for menu/search) | Top utility bar, main nav (6 items), search, auth, CTA. Mobile drawer below **1180px** |
| `SiteFooter`                                                           | `components/layout/site-footer.tsx` (server)                                     | Contact details are placeholders until OQ-18 is answered                               |
| `PageHero`                                                             | `@roshd/ui` `PageHero`                                                           | Breadcrumb + eyebrow + title + lead, grid background                                   |
| `CourseCard`                                                           | `components/cards/course-card.tsx`                                               | Price label: free / not free. Price comes from the API later                           |
| `ContentCard`                                                          | `components/cards/content-card.tsx`                                              | Articles, knowledge and research                                                       |
| `ProjectCard`                                                          | `components/cards/project-card.tsx`                                              | Always shows the "نمونه نمایشی" badge when `isDemo`                                    |
| Filter chips, FAQ accordion, forms, demo notice, empty/skeleton states | `@roshd/ui` primitives                                                           | `Chip`, `Accordion`, `Field`, `Notice`, `EmptyState`, `Skeleton`                       |

## Design tokens (extracted)

| Token                                | Value                                         | Usage                                    |
| ------------------------------------ | --------------------------------------------- | ---------------------------------------- |
| `--color-brand-900`                  | `#0B2257`                                     | headings, dark sections, active chip     |
| `--color-brand-950`                  | `#081A44`                                     | footer                                   |
| `--color-primary`                    | `#1450C8`                                     | primary buttons, links, accents          |
| `--color-primary-hover`              | `#0F3E9E`                                     | button hover                             |
| `--color-accent`                     | `#0BA5E0`                                     | focus ring, secondary dots               |
| `--color-accent-soft`                | `#7FD6F5`                                     | eyebrow on dark                          |
| `--color-ink`                        | `#0E1A33`                                     | body text                                |
| `--color-ink-2` / `-3` / `-4` / `-5` | `#1B2740` / `#3A4660` / `#4A5670` / `#5B667D` | secondary text scale                     |
| `--color-surface`                    | `#F3F6FA`                                     | tinted sections                          |
| `--color-surface-hover`              | `#F7FAFF`                                     | card hover                               |
| `--color-border` / `-strong`         | `#E3E7EF`, `#DDE3EE` / `#C9D2E3`              | dividers, inputs                         |
| `--color-demo-bg/fg/border`          | `#FFF4DC` / `#7A4B00` / `#D9A441`             | "نمونه نمایشی" badge                     |
| `--color-notice-bg/fg/border`        | `#FFF8E8` / `#5E3C00` / `#EFD9A6`             | demo notice                              |
| `--color-success-bg/fg`              | `#EAF6EF` / `#155B34`                         | success state                            |
| `--color-danger`                     | `#B42318`                                     | errors                                   |
| Radii                                | 4 / 6 / 8 / 10 px                             | chips / buttons, inputs / cards / panels |
| Container                            | max 1280px, gutter 24px                       |                                          |
| Font                                 | Vazirmatn 300–900                             | self-hosted                              |

## Known conflicts and decisions

| #   | Prototype                                                  | Architecture                                         | Resolution                                                                                         |
| --- | ---------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C1  | Auth modal: mobile number + OTP ("دریافت کد ورود")         | ADR-0002: email + password. OTP waits on OQ-08/OQ-20 | Build email+password now and keep the modal layout. Add an OTP tab when the SMS provider is chosen |
| C2  | Nav "مشاوره" links to `Services.dc.html`                   | Roadmap has both `/services` and `/consulting`       | `/consulting` = consulting services list. `/services` = overview of all 4 journeys + consulting    |
| C3  | Prototype banner "نسخه نمونه اولیه · داده‌ها نمایشی هستند" | Production must not claim a prototype                | Show the banner only when `NEXT_PUBLIC_DEMO_MODE=true`                                             |
| C4  | Hard-coded mock data (`mock-data.js`)                      | ADR-0005: content layer + API                        | Institutional copy → `src/content`. Collections → API + seed data flagged `isDemo`                 |
| C5  | Footer/contact placeholders `[نمونه]`                      | OQ-18                                                | Keep placeholders clearly marked until OQ-18 is answered                                           |
| C6  | Partner/credential logo slots                              | Roadmap: show only verified credentials              | Keep the placeholder slots with the note "فقط پس از دریافت و تأیید مدارک رسمی" (OQ-17)             |
| C7  | Detail pages link to `#`                                   | Roadmap has `/articles/[slug]` etc.                  | Implement slug detail routes                                                                       |
| C8  | Home "direction A/B/C" switch in the script                | Only variant A is rendered                           | Implement variant A only                                                                           |

## Update workflow

When a new handoff arrives:

1. Replace `design/claude-design/` with the new bundle (separate `chore/design-sync-*` branch).
2. `git diff` the raw files to see what changed.
3. Update the tokens and components above. Never rename domain entities to match visual labels. Never move business logic into visual components.
