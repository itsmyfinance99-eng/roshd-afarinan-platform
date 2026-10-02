# Frontend (apps/web)

## Structure

```text
src/
  app/                 App Router routes. Server components by default
    (public)/          public site layout (header/footer)
    (auth)/            login/register
    dashboard/         dashboard shell (role-based)
  components/          app-specific composites (sections, layout)
  content/             typed institutional copy (see ADR-0005)
  lib/                 api client, formatting (fa-IR), seo helpers
packages/ui            design tokens (CSS variables) + primitives
```

## Rules

- Pages are RTL (`dir="rtl"`) and use logical CSS properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start`, `end`). Physical left/right is not allowed.
- Show numbers with `formatNumber()` (Persian digits).
- Every data-fetching view handles loading (`loading.tsx` / skeleton), empty, error (`error.tsx`) and success.
- Forms use React Hook Form + `@hookform/resolvers/zod` with the shared schemas from `@roshd/validation`.
- Each public route exports `metadata`/`generateMetadata` with a canonical URL and adds JSON-LD where it applies.
- Business logic and data contracts must not live in visual components, so a new design handoff only changes tokens and styling.

## Design system (v2 "Copper & Graphite")

- Source of truth: `design/claude-design/` (raw handoff, never edited) and the integration map with decisions D1–D20 in [design/INTEGRATION.md](../../design/INTEGRATION.md).
- Tokens: `packages/ui/src/tokens.css`. The site is dark-first; light reading and form regions set `data-surface="paper"`, and `data-surface="dark"` restores the dark values inside a paper region. The dashboard renders on paper.
- Copper text uses `text-accent`: on paper `--color-accent` is remapped to `#9A5A26`, while raw copper (`#D08A4E`) fails contrast on the light surface.
- Fonts: Vazirmatn for body text, Noto Kufi Arabic (600–800) for display, both self-hosted.
- Motion: client islands in `apps/web/src/components/motion` plus keyframes in `globals.css` under `html.ra-motion`. No motion library. Nothing animates under `prefers-reduced-motion`; the intro plays once per session and can be skipped.
- The home hero has two variants behind `HERO_VARIANT` in `components/home/hero.tsx` (default `'B'`).
