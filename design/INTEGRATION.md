# Claude Design handoff: integration map (v2 "Copper & Graphite")

- **Source:** Claude Design project `5c1ac6ab-902c-4365-8c80-3d445afff738`, handoff bundle `design_handoff_copper_graphite` (imported 2026-10-01). It replaces the v1 blue handoff (ST-04.07) completely.
- **Raw files:** [`design/claude-design/`](claude-design/) is kept **verbatim** as the visual reference: `README.md`, `tokens.copper-graphite.css` and `prototype/`. Do not edit it. Re-import a new handoff over it.
- **Target:** `apps/web` (Next.js App Router) and `packages/ui`.

The prototype is HTML plus the Claude Design runtime (`support.js`, which loads React from unpkg and compiles `<x-dc>` templates) and a motion script (`motion.js`). We **recreate** the visuals in Next.js/Tailwind. We do not ship the runtime, `motion.js`, the unpkg scripts or the Google Fonts link. Fonts are self-hosted.

## Route mapping

| Prototype file                            | Next.js route                                    | Data source                                      |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `Home.dc.html`                            | `/`                                              | content layer + catalog APIs                     |
| `Training.dc.html`                        | `/training`                                      | `GET /api/v1/courses`                            |
| `Course.dc.html`                          | `/training/[slug]` (+ `/training/[slug]/enroll`) | `GET /api/v1/courses/:slug`                      |
| `Feasibility.dc.html` (+ `#request` form) | `/feasibility`, `/feasibility/request`           | `POST /api/v1/service-requests`                  |
| `Investment.dc.html`                      | `/investment`                                    | `GET /api/v1/investments`                        |
| `Services.dc.html` (nav label "مشاوره")   | `/consulting` (+ `/services` overview)           | content layer                                    |
| `Contact.dc.html`                         | `/contact`                                       | `POST /api/v1/service-requests` (type `CONTACT`) |
| `About.dc.html`                           | `/about`                                         | content layer (CMS page override)                |
| `Research.dc.html`                        | `/research`                                      | `GET /api/v1/research`                           |
| `Knowledge.dc.html`                       | `/knowledge`                                     | `GET /api/v1/knowledge`                          |
| `Articles.dc.html`                        | `/articles`                                      | `GET /api/v1/articles`                           |
| `Iran Sahamdar.dc.html`                   | `/iran-sahamdar`                                 | content layer (no integration)                   |
| Search overlay in `SiteHeader`            | overlay + `/search`                              | `GET /api/v1/search`                             |
| Auth modal in `SiteHeader`                | `/login`, `/register`                            | `POST /api/v1/auth/*`                            |

Routes that the handoff does not draw use the same tokens and shared components: `/services`, the detail pages (`/articles/[slug]`, `/knowledge/[slug]`, `/research/[slug]`, `/investment/[slug]`), the request forms (`/consulting/request`, `/research/request`, `/investment/[slug]/interest`, `/training/[slug]/enroll`), auth pages, `/search`, `/track`, `/verify-email`, `not-found`, `error` and the dashboard.

## Component mapping

| Prototype component                      | Target                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `SiteHeader`                             | `apps/web/src/components/layout/site-header.tsx` (client)                     |
| `SiteFooter`                             | `apps/web/src/components/layout/site-footer.tsx` (server + reveal islands)    |
| `PageHero`                               | `@roshd/ui` `PageHero` (server; per-word lead via `RevealWords`)              |
| `CourseCard`/`ProjectCard`/`ContentCard` | `apps/web/src/components/cards/cards.tsx`                                     |
| Motion layer (`motion.js`)               | `apps/web/src/components/motion/*` (client islands) + `globals.css` keyframes |
| Sliding chip indicator                   | `@roshd/ui` `ChipGroup` / `apps/web` `FilterChips` (link chips)               |
| FAQ accordion                            | `@roshd/ui` `Accordion`                                                       |
| Form fields                              | `@roshd/ui` `FieldShell`, `TextInput`, `TextArea`, `Select`                   |
| Skeleton / empty / notice / badge        | `@roshd/ui` `Skeleton`, `EmptyState`, `Notice`, `DemoBadge`                   |

## Tokens and surfaces

`packages/ui/src/tokens.css` is the handoff's `tokens.copper-graphite.css` with these additions:

- `--color-focus` (copper on dark, copper-deep on paper) drives every focus ring.
- `[data-surface='paper']` also remaps the notice and demo-badge tokens to the light amber values, and the primary _text_ token, so copper text on paper stays readable (`#9A5A26`).
- `[data-surface='dark']` restores the dark values inside a paper region (e.g. the course summary card).
- Font: Noto Kufi Arabic (display, 600–800) is self-hosted with `@fontsource/noto-kufi-arabic`; Vazirmatn stays the body font.

## Known conflicts and decisions

| #   | Prototype                                                                                | Repo / rule                                                      | Resolution                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Auth modal: mobile number + OTP                                                          | ADR-0002 email + password; OTP waits on OQ-08/OQ-20              | Header «ورود / ثبت‌نام» goes to `/login`; the auth pages use the modal's visual language (dark card, tabs)                                                                                                                                                                      |
| D2  | Contact/footer placeholders «[پس از تأیید]», social placeholders                         | OQ-18 answered 2026-09-25 (`content/site.ts` `contact`)          | Show the confirmed address, postal code, phone, email and Instagram. Omit «ساعات کاری» and the map until supplied                                                                                                                                                               |
| D3  | Footer privacy/terms links to `#`                                                        | OQ-21 (no policy text yet)                                       | Not rendered until the pages exist                                                                                                                                                                                                                                              |
| D4  | Search overlay filters mock data client-side                                             | Real search API                                                  | Overlay queries `/api/v1/search` (debounced) with loading, empty and error states; Enter goes to `/search`                                                                                                                                                                      |
| D5  | Forms say «ارسال یا ذخیره نمی‌شود» / fake tracking code                                  | Forms really submit                                              | No false demo notices; real tracking code; feasibility keeps email + attachments                                                                                                                                                                                                |
| D6  | Listing filters are client state with a fake 500ms skeleton                              | URL/server-driven filters (SEO, shareable)                       | Keep URL filters; show the skeleton only during the real transition (`useTransition`), no artificial delay                                                                                                                                                                      |
| D7  | Course detail: outline and audience arrays                                               | Not API fields                                                   | Render the markdown description on paper (numbered lists styled as the outline); no invented audience                                                                                                                                                                           |
| D8  | Course body is dark text on dark (missing paper wrapper)                                 | README: course body is paper                                     | Wrap the article in `data-surface="paper"`                                                                                                                                                                                                                                      |
| D9  | Hero A/B review switcher, `?hero=`, `RoshdForceMotion`, intro every load                 | README: do not ship                                              | `HERO_VARIANT` constant, default **B**; intro once per session, never under reduced motion                                                                                                                                                                                      |
| D10 | Process CTA hover turns text white on copper                                             | Text on copper is always `#111418`                               | Hover keeps `#111418`                                                                                                                                                                                                                                                           |
| D11 | Iran Sahamdar badge `#7A4B00` on dark; `#C3CDE0` dashed border; unstyled Knowledge input | v1 leftovers                                                     | Use the v2 tokens                                                                                                                                                                                                                                                               |
| D12 | Two-digit ordinals in v1                                                                 | README: no leading zero                                          | `ordinal()` returns ۱، ۲، ۳                                                                                                                                                                                                                                                     |
| D13 | Copyright «— نسخه نمونه اولیه»                                                           | Production must not claim a prototype                            | Suffix and header pill only when `NEXT_PUBLIC_DEMO_MODE=true`                                                                                                                                                                                                                   |
| D14 | Dashboard not in the handoff                                                             | Must stay readable                                               | Dashboard content on `data-surface="paper"`, dark header/sidebar                                                                                                                                                                                                                |
| D15 | Copper line-art logo                                                                     | Needs an SVG master from the client                              | Keep `logo.png`; white rendering (`brightness(0) invert(1)`) only in the intro, as designed                                                                                                                                                                                     |
| D16 | Final CTA pill «گفت‌وگوی اولیه رایگان است»                                               | CLAUDE.md: no invented prices or business rules                  | Neutral pill «مشاوره، امکان‌سنجی و پژوهش» until OQ-25 is answered                                                                                                                                                                                                               |
| D17 | Future cards carry `aria-disabled` on `<li>`                                             | Not an allowed attribute on list items (axe)                     | Dropped; «به‌زودی» and the lock icon say it                                                                                                                                                                                                                                     |
| D18 | Home project preview simulates a 500ms loading state                                     | No artificial delays (D6)                                        | The home preview filters locally and instantly, so it has no skeleton; /investment shows skeletons during real loads                                                                                                                                                            |
| D19 | Inner pages use `data-auto-reveal` (script decides at runtime)                           | Server-rendered markup; hiding blocks after first paint flickers | Blocks carry explicit `data-reveal` in markup; the engine only reveals, it never re-marks the DOM                                                                                                                                                                               |
| D20 | Motion script mutates the DOM directly                                                   | React owns the DOM                                               | `components/motion/motion-engine.tsx` only toggles `data-shown`; visual states are CSS in `globals.css` under `html.ra-motion`, which the `<head>` boot script sets unless reduced motion is preferred. Ticker, text loop, sonar, intro and reading progress are client islands |

## Coverage checklist

Tick an item only when it is implemented and checked in the browser (desktop and mobile). `✓` = done.

### Foundation

- [x] Tokens replaced; paper/dark scopes; focus token; light notice/demo values on paper
- [x] Noto Kufi Arabic self-hosted; `font-display` utility; body `#111418`; link colours `#E7B386` → `#EDEFF2`; focus ring 3px copper
- [x] Keyframes: pulse, ping, breathe, drift (off on low power), shimmer, shimmerSlow, shine, marquee, wave, trace, bar, float, flow, node, dash
- [x] Global reduced-motion kill switch; every effect has a static end state
- [x] `Reveal` (fade, words, pop, wipe, grow-y), stagger, delay/duration, threshold 0.2, rootMargin −5%, once
- [x] `Draw` (pathLength 1, 900ms default), `Ticker` (1200ms ease-out cubic, Persian digits, prefix), `TextLoop` (2.8s, out 320ms, in 420ms; paused when hidden)
- [x] `Spotlight` (`--mx/--my`, spot opacity 200ms), `Marquee` (pause on hover/focus; reduced motion wraps and hides the duplicate)
- [x] `SonarGrid` canvas (rings every 1.5s, 4200ms, brightness wave, pointer rings, DPR ≤ 2, pause off-screen/hidden, still frame on low power/reduced motion)
- [x] `FloatingPaths` (2×30 paths, dash .6 .4, 20–35s), `ProcessRail` (auto: 950ms/segment, hold 2200ms, loop; vertical on narrow), `ReadingProgress`
- [x] Inner-page reveals: explicit `data-reveal` on each block (D19)
- [x] `Intro` (network canvas, logo, «رد شدن», Esc/click skip, matrix tile reveal, scroll lock, once per session)

### Shared components

- [x] Header: sticky overlay on Home, solid elsewhere; scrolled state after 24px (bg, blur, line, shadow; utility row slides −44px)
- [x] Header: utility links, dismissible demo pill (sessionStorage `ra-pill-closed`), logo tile + two-line wordmark
- [x] Header: 6 main links ≥1240px with underline from the right; active copper 700; search button; auth button; copper CTA with shine
- [x] Mobile drawer (right, `min(360px,88vw)`, 40ms stagger, CTA + auth), Esc/overlay close, focus return
- [x] Search overlay (720px, placeholder, «بستن (Esc)», hint, typed results, empty state, loading/error)
- [x] Footer: glows, dot texture, 4 columns with stagger, socials, contact, two buttons, outlined wordmark with copper wipe, bottom bar
- [x] PageHero: dot texture, haze, ping ring, breadcrumb, eyebrow dash, Kufi h1, per-word lead
- [x] CourseCard, ProjectCard, ContentCard: slots, badges, spotlight, hover lift, focus glow, stretched link
- [x] Buttons (primary copper + shine, ghost, outline, inverse); chips with sliding indicator; switch; accordion (+ rotates 45°); fields (48px, focus ring, error icon); skeleton shimmer; empty state; notice; demo badge; success check draw

### Home

- [x] Hero B (and A behind the constant): gradient, sonar, fade, drifts, breathing band, horizon line
- [x] Eyebrow pill, h1 with sr-only sentence + word loop gradient, lead, CTAs, stats dl (tickers, ۱۳۸۸ wave underline)
- [x] Spiral figure ≥1024px (path draw, 8 nodes, chip sides, emphasised ۴ and ۸ with pulse); vertical list with grow-y line below
- [x] Experience marquee (speed 52, edge blur, mask)
- [x] Four-paths bento with the four illustrations and responsive layouts
- [x] Trust bento (+۵۰, ۳, credentials, ۱۳۸۸, expertise) with responsive placements
- [x] Services on paper (6 icons, spotlight, «همه خدمات ‹»)
- [x] «طرح‌های در حال مطالعه» table rows + demo badge
- [x] Courses (4 cards); research + knowledge columns (3 + 3)
- [x] Project preview: demo note, sector chips with indicator, stage select, empty, grid (no skeleton, D18)
- [x] Process rail section + CTA
- [x] Future capabilities (locked, «به‌زودی», shimmerSlow; no `aria-disabled`, D17)
- [x] Final CTA panel with floating paths
- [x] Intro

### Inner pages

- [x] Training: filter panel, sliding chips, free-only switch, count, skeleton, empty, grid
- [x] Course: reading progress, hero lead, paper article (demo notice, outline, related), sticky summary card, interest CTA → enroll, «پرسش درباره دوره ‹»
- [x] Feasibility: scope cards, paper request section (step list + 3-step form card, progress bar, validation, sending, success), FAQ
- [x] Investment: note, filter panel (search, stage, reset, chips), count, skeleton, empty (2 buttons), grid
- [x] Consulting (Services): numbered rows, FAQ, CTA panel; `/services` overview re-themed
- [x] Contact: form card, validation after first submit, sending, success; contact list
- [x] About: stats, activity list, expertise chips, credentials slots + note
- [x] Research: toggle chips, card grid, CTA panel
- [x] Knowledge: 960px column, search 54px, chips, list rows, empty
- [x] Articles: chips, cards with image slot
- [x] Iran Sahamdar: path chips, dashed integration panel + flow diagram, projects section
- [x] Other routes (details, request forms, auth, search, track, verify-email, 404, error) re-themed
- [x] Dashboard readable on paper

### Verification

- [ ] `pnpm verify` green; Playwright e2e + axe (no serious/critical, heading order) green
- [ ] Contrast spot-checks on dark and paper
- [ ] Screenshots desktop/mobile compared with the prototype

## Update workflow

When a new handoff arrives:

1. Replace `design/claude-design/` with the new bundle (separate `chore/design-sync-*` branch).
2. `git diff` the raw files to see what changed.
3. Update the tokens and components above. Never rename domain entities to match visual labels. Never move business logic into visual components.
