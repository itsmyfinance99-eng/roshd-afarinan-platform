# ADR-0005: Content strategy (in-house CMS + typed content layer)

- Status: Accepted
- Date: 2026-09-25

## Decision

- The **CMS is an API module** backed by PostgreSQL. It covers Page, Article, KnowledgeArticle, Category, Tag, Author and Media, with SEO fields built into the model. We use no SaaS CMS, to avoid lock-in and to keep data ownership with the client.
- Rich text is stored as **Markdown** and rendered on the web with a safe renderer that allows no raw HTML.
- Collections (articles, knowledge, courses, research, investment opportunities) are fetched from the API and rendered with ISR (`revalidate`).
- **Interim:** institutional copy (home hero, service descriptions, company facts) lives in the typed content layer `apps/web/src/content/*`. Components never hard-code copy. This layer moves into CMS `Page` sections in a later story (EPIC-03), and the components don't change.
- If the API is unreachable, public pages render a graceful error/empty state instead of failing the build.

## Consequences

- Copy changes need a deploy until the Page-sections migration. This is accepted for the MVP.
- Articles and knowledge stay separate entities (roadmap §13), which helps future semantic search and RAG.
