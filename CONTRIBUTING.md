# Contributing

## Workflow

1. Pick a story from the current sprint milestone on GitHub. The backlog source of truth is `docs/backlog/backlog.yaml`.
2. Branch from `develop`:
   ```bash
   git switch develop && git pull
   git switch -c feature/ST-04.03-home-page
   ```
   Prefixes: `feature/`, `fix/`, `chore/`, `docs/`, `hotfix/` (the last one from `main` only).
3. Commit small, meaningful changes using [Conventional Commits](https://www.conventionalcommits.org/):
   ```text
   feat(api): add refresh token rotation
   fix(web): correct RTL alignment in footer
   chore(ci): cache pnpm store
   ```
   Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
4. Run the full gate locally. Everything must be green:
   ```bash
   pnpm verify
   ```
5. Push and open a PR into `develop` using the template. Link the story (`Refs #N`).
6. Squash-merge after CI passes. Set `status: done` for the story in `backlog.yaml`, then run `pnpm backlog:sync`.

## Releases

At the end of each phase, open a release PR `develop → main`, update `CHANGELOG.md`, merge with a merge commit, and tag `vX.Y.Z`.

## Rules

- Never commit secrets. Document new env variables in `.env.example`.
- Every schema change needs a Prisma migration.
- Never force-push, reset or rewrite `main`/`develop` without the owner's explicit approval.
- Read `CLAUDE.md`. It is the engineering rulebook for humans and AI agents alike.
