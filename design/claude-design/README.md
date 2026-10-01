# Handoff: Roshd Afarinan — v2 "Copper & Graphite" theme

## Overview
Visual + motion redesign of the public site of رشدآفرینان صنعت و معدن (fa-IR, RTL). Same information architecture and copy as the current `apps/web`; this bundle changes the theme (dark graphite + copper), typography (Noto Kufi Arabic display), and adds a motion layer (entrance intro, scroll reveals, sonar hero, animated process rail, animated illustrations).

Only the Copper & Graphite theme is in scope. The earlier blue theme is **not** part of this handoff.

## About the design files
Everything in `prototype/` is a **design reference built in HTML** — it shows intended look and behaviour, it is not production code. Recreate it inside the existing monorepo (`RoshdAfrinan Site`): Next.js App Router in `apps/web`, Tailwind v4, shared components in `packages/ui`. Follow the repo `CLAUDE.md`: server components by default, client components only for the interactive/motion parts, no hard-coded colours outside tokens, content stays in `apps/web/src/content` / CMS.

Open any `prototype/*.dc.html` directly in a browser (needs `support.js`, `motion.js`, `mock-data.js`, `assets/` beside it). `Home.dc.html?hero=A|B` switches hero background; `?intro=1` forces the intro.

## Fidelity
**High-fidelity.** Colours, type sizes, radii, spacing, easing and durations are final. Images are placeholders (patterned boxes) — keep them as slots. All projects, courses, articles and research items are demo data and must keep the «نمونه نمایشی» badge (`isDemo`).

## Design tokens
`tokens.copper-graphite.css` is a drop-in replacement for `packages/ui/src/tokens.css`. Token names are kept where a v1 equivalent exists, so most existing utilities keep working with new values. Key rules:
- Page bg `#111418`, cards `#1A1F26`, lines `#2A313B` / `#3A4250`, footer `#0B0E12`.
- Copper `#D08A4E` for buttons/active states; **text on copper is `#111418`, never white.** Copper text on dark = `#E7B386`; copper text on paper = `#9A5A26`.
- Ink on dark: `#EDEFF2` headings, `#C3C9D2` body, `#9AA3AF` meta.
- Paper regions (`[data-surface="paper"]`, bg `#F4F1EC`/`#FAF8F4`, ink `#1A1F26`/`#4A5260`) are used for: Home services section, Course detail body, Feasibility request section.
- Contrast (WCAG 2.1 AA) — approximate: `#EDEFF2` on `#111418` ≈ 16:1; `#C3C9D2` on `#111418` ≈ 11:1; `#9AA3AF` on `#111418` ≈ 7:1; `#E7B386` on `#111418` ≈ 9.5:1; `#111418` on `#D08A4E` ≈ 7:1; `#9A5A26` on `#F4F1EC` ≈ 5:1; `#4A5260` on `#F4F1EC` ≈ 7:1. Re-verify with a tool after implementing.

Typography
- Display (h1–h3): Noto Kufi Arabic 800. h1 `clamp(36px,5vw,64px)` / lh 1.35; section h2 `clamp(28px,3.4vw,42px)` / lh 1.4–1.45; "تخصص و سابقه" h2 is smaller `clamp(20px,2.4vw,30px)` on one line; card h3 17–30px.
- Body: Vazirmatn 400–700, 14–19px, line-height 1.9–2.05. Eyebrow 14px/700 copper.
- Numbers are Persian digits, **no leading zero** (۱, ۲, ۳ — not ۰۱). Spiral labels use «۱.» with a trailing dot.

Radii: chip 4, control 6, card 8, panel 10, tile 16, feature/CTA 20, pill 999.
Shadows: button `0 12px 30px -12px rgba(208,138,78,.8)`; tile hover `0 24px 48px -28px rgba(208,138,78,.5)`; form card `0 30px 60px -40px rgba(0,0,0,.45)`.
Easing: enter `cubic-bezier(.22,1,.36,1)`, state `cubic-bezier(.65,0,.35,1)`.

## Shared components (packages/ui)
- **SiteHeader** (`prototype/SiteHeader.dc.html`) — sticky; 44px utility row (secondary links + dismissible «نسخه نمونه اولیه» pill, dismissal in sessionStorage) + 72px main row (logo, 6 primary links, search, login, copper CTA «درخواست امکان‌سنجی» with periodic shine sweep). Transparent over hero, becomes `rgba(17,20,24,.85)` + 14px backdrop blur + bottom line after 24px scroll; utility row slides up (translateY −44px, 300ms state easing). Nav underline scales from the right on hover/active (200ms). Desktop nav ≥1240px, otherwise a right-side drawer. Also contains search overlay (client-side filter, empty state) and login/register modal (phone `^09\d{9}$`, Persian digits accepted).
- **SiteFooter** — `#0B0E12`, copper glow breathing at bottom, dot texture, 4 columns (about, links, services, contact placeholders — do NOT invent address/phone). Big outlined wordmark «رشدآفرینان» in Noto Kufi 800, `clamp(30px,7.2vw,106px)`, stroke `#3A4250` with a copper gradient fill wiped in from the right (1400ms).
- **PageHero** — interior page hero: breadcrumb, eyebrow, h1, lead revealed per word, dot texture + pinging ring.
- **CourseCard / ProjectCard / ContentCard** — cursor spotlight (radial glow follows pointer), −3px lift + copper border on hover, image zoom 1.04, «نمونه نمایشی» badge.
- **Chip group with sliding indicator** — one absolutely positioned copper pill that moves (transform + width, 300ms state easing) to the pressed chip. Used in Home project filter, Training, Investment.
- **Accordion (FAQ)** — bordered cards, «+» rotates 45° to «×», answer fades in (300ms).
- **Form field** — 48px, focus ring `0 0 0 4px` copper/15%, error text with icon, `aria-invalid`/`aria-describedby`; submit shows «در حال ارسال…», success shows an SVG circle+check drawn with stroke-dashoffset.

## Screens
All in `prototype/`. Each keeps the v1 structure; listed here with v2-specific notes.
1. **Home** — Hero (two background options, pick one: `A` Sonar grid — canvas dot grid with copper rings rippling out every ~1.5s plus slow wave of dot brightness; `B` Glow horizon — graphite gradient, drifting copper haze, horizontal copper light line). Headline «از ایده تا» + word loop (امکان‌سنجی / پژوهش / تأمین مالی / سرمایه‌گذاری, 2.8s, word-level only — never split Persian letters). Stats row: +۵۰ ticker, ۳ ticker (centred), ۱۳۸۸ (centred) with an animated copper wave underline. Right: golden-spiral "journey" SVG, path drawn on load, 8 numbered labelled nodes (nodes ۴ and ۸ emphasised with pulse); on <1024px becomes a vertical list with a growing line. → Experience marquee (RTL, pauses on hover/focus, edge blur). → Four-paths bento (Training, Feasibility feature tile, Research, Iran Sahamdar) with animated line illustrations (see Motion). → Trust bento (+۵۰ tile, ۳, ۱۳۸۸, expertise chips, credentials list — text only, no numbers). → Services on **paper**. → Feasibility demo table, courses, research + knowledge, project preview with filters/skeleton/empty. → Process (dark) auto-playing rail ۱→۵. → Future features (locked, «به‌زودی», slow shimmer). → CTA panel with floating paths.
2. **Training** — PageHero, filter bar (sliding chip + "free only" switch), count, skeleton (450ms), empty state, CourseCard grid.
3. **Course detail** (`Course.dc.html?id=c1`) — reading progress bar under header; **paper** article (demo notice, outline, audience, related) + sticky summary card (price label, "زمان برگزاری: پس از اعلام", interest CTA → animated success).
4. **Feasibility** — scope cards; **paper** request section: left step list, right 3-step form (contact → project → description + review), progress bar, per-step validation, submit/success; FAQ accordion.
5. **Investment** — filter bar (search, stage select, sliding sector chips, conditional reset), skeleton, empty, ProjectCard grid, demo notice.
6. **Services** — service cards, FAQ accordion, CTA panel.
7. **Contact** — form card (2-column grid, validation, sending, animated success), contact placeholders.
8. **About, Research, Knowledge, Articles, Iran Sahamdar** — v1 structure re-themed; sections auto-reveal on scroll.

## Motion (reference: `prototype/motion.js`)
Implement as small client components/hooks (e.g. `useReveal`, `<Ticker>`, `<TextLoop>`, `<SonarGrid>`, `<Marquee>`, `<ProcessRail>`, `<Intro>`). Animate only transform / opacity / clip-path / filter / stroke-dashoffset.
- **Intro (Home only)**: fullscreen graphite radial bg → logo (200px, rendered white via `brightness(0) invert(1)` + copper glow, no tile) scales in → a branching node network grows from above the logo and fills the screen (~1.9s) → screen opens tile-by-tile from the centre outward like a matrix (~1.1s) → removed. Click / Esc / «رد شدن» skips. Review build shows it on every load; for production show once per session (sessionStorage) and never under reduced motion.
- **Reveal**: opacity 0→1, translateY 20→0, blur 6→0, 600ms enter easing, once at ~20% visibility; children stagger 70–80ms. Variants: per-word (lead text), pop (nodes), wipe (clip-path from right), grow-y (lines), draw (SVG strokes, `pathLength=1`).
- **Ticker**: count up in Persian digits, 1200ms ease-out cubic.
- **Process rail**: auto-plays when in view — fill advances step to step (950ms per segment, eased), current dot scales 1.12 with copper glow and lifts −4px, holds 2.2s at the end, loops. Vertical on mobile.
- **Card illustrations** (Home bento): Training — book outlines draw in, text lines trace in sequence (3.6s loop), copper dot floats; Research — bars breathe scaleY .6↔1 (2.8s, staggered .35s), copper trend line traces; Iran Sahamdar — edges draw, nodes pop in sequence, copper "packets" flow along edges (3.2s), hub emits a ring (2.4s); Feasibility — concentric rings with ping.
- **Ambient**: button shine sweep (6s), footer glow breathe (7s), hero haze drift (14s), sonar canvas (pauses off-screen / hidden tab; static frame on low-power: <768px, coarse pointer, saveData, ≤2 cores).
- **Reduced motion**: every effect must have a static end state under `prefers-reduced-motion: reduce`. NOTE: the prototype sets `window.RoshdForceMotion = true` to override this for review — **do not ship that override.**

## State
Header: scrolled, pillDismissed, menuOpen, searchOpen/query, authOpen/tab/fields/errors. Listing pages: category/sector, stage, query, freeOnly, loading (simulated — replace with real fetch + error state). Feasibility: step (0–2), values, errors, submitting, sent. Course: interest registered. Data now comes from `mock-data.js`; map to existing CMS/API modules.

## Assets
`prototype/assets/logo.png` (1218×1292, transparent PNG, original blue gradient). The brief asks for a copper line-art logo; this needs a vector (SVG) master from the client. Fonts: Vazirmatn (already in repo), Noto Kufi Arabic 600–800 (Google Fonts / self-host via `next/font`). All illustrations are inline SVG in the prototype. No photography yet.

## Content rules (unchanged)
Only verified facts: 50+ experts, active since 1388, training/research/consulting, the credential names listed (no numbers). Contact details are placeholders «[پس از تأیید]». Do not invent returns, clients, prices or open opportunities.

## Files
- `tokens.copper-graphite.css` — new token set.
- `prototype/Home.dc.html`, `Training.dc.html`, `Course.dc.html`, `Feasibility.dc.html`, `Investment.dc.html`, `Services.dc.html`, `Contact.dc.html`, `About.dc.html`, `Research.dc.html`, `Knowledge.dc.html`, `Articles.dc.html`, `Iran Sahamdar.dc.html` — screens.
- `prototype/SiteHeader.dc.html`, `SiteFooter.dc.html`, `PageHero.dc.html`, `CourseCard.dc.html`, `ProjectCard.dc.html`, `ContentCard.dc.html` — shared components.
- `prototype/motion.js` — motion layer reference (all timings/easings).
- `prototype/mock-data.js` — demo content shape.
- `prototype/support.js` — prototype runtime only; ignore for implementation.
