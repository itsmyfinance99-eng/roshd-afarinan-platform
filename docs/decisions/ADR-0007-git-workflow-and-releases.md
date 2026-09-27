# ADR-0007: Git workflow, commits and releases

- Status: Accepted
- Date: 2026-09-25

## Decision

- **Branches:** `main` (production, release-only), `develop` (integration). Short-lived `feature/<story-id>-<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>` branches come off `develop`.
- **Commits:** Conventional Commits (`type(scope): subject`), enforced by commitlint through a Husky `commit-msg` hook. Prettier runs on staged files (lint-staged).
- **Pull requests:** into `develop`, using the PR template. Each links its story (`Closes #N`). Local `pnpm verify` must be green, and CI must pass. The default merge strategy is squash, which keeps `develop` history one-commit-per-story. **Stacked PRs** (a PR whose base is another feature branch) use a merge commit instead, so the dependent branches keep a shared history.
- **Releases:** at the end of each phase, a release PR `develop → main` gets a merge commit and a SemVer tag (`v0.1.0` Phase 0, `v0.2.0` Phase 1). `CHANGELOG.md` is updated.
- **Hotfixes:** `hotfix/<slug>` from `main`, merged into both `main` and `develop`.
- Force-pushing, resetting or rewriting `main`/`develop` is forbidden without the owner's explicit approval.
