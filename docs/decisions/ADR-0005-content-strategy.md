# ADR-0005: Content strategy (in-house CMS + typed content layer)

- Status: Accepted
- Date: 2026-09-25

## Decision

- The **CMS is an API module** backed by PostgreSQL. It covers Page, Article, KnowledgeArticle, Category, Tag, Author and Media, with SEO fields built into the model. We use no SaaS CMS, to avoid lock-in and to keep data ownership with the client.
- Rich text is stored as **Markdown** and rendered on the web with a safe renderer that allows no raw HTML.
- Collections (articles, knowledge, courses, research, investment opportunities) are fetched from the API and rendered with ISR (`revalidate`).
- **Interim:** institutional copy (home hero, service descriptions, company facts) lives in the typed content layer `apps/web/src/content/*`. Components never hard-code copy. This layer moves into CMS `Page` sections in a later story (EPIC-03), and the components don't change.
- If the API is unreachable, public pages render a graceful error/empty state instead of failing the build.

- **Storage (implemented in ST-03.01):** articles and knowledge entries are distinct content kinds with separate APIs (`/articles`, `/knowledge`), routes and sitemap entries. They share one `ContentEntry` table discriminated by `kind`, because they share the editorial lifecycle (DRAFT → PUBLISHED → ARCHIVED) and the SEO fields. Knowledge entries use `references` for their sources.
- Demo content is flagged `isDemo`, rendered with «نمونه نمایشی», marked `noindex` and excluded from the sitemap. It is loaded only in development with `pnpm --filter @roshd/api db:seed:demo`. The web app holds no demo records of its own: every collection (articles, knowledge, courses, research, investment opportunities) comes from the API.

## Consequences

- Copy changes need a deploy until the Page-sections migration. This is accepted for the MVP.
- Articles and knowledge stay separate entities (roadmap §13), which helps future semantic search and RAG.

## Update (ST-03.04): editable institutional pages

Institutional pages are CMS `Page` records made of typed sections (`intro`, `stats`, `list`, `richText`), validated by a discriminated union (unknown section types are rejected, and raw HTML is never rendered). The web renders a published page when one exists and otherwise falls back to the reviewed content layer (`apps/web/src/content/pages.ts`). The dashboard editor starts from those defaults, so the first save moves the copy into the CMS without a deploy. The About page is the first page migrated this way.
