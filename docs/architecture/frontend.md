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
- The final Claude Design pass will replace token values and component styling. Business logic and data contracts must not live in visual components.
