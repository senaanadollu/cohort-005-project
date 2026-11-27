## Verification checks

Do these checks in this order before you report a change to `app/` as complete:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run lint:boundaries`
4. `npm run format:check`
5. `npm run test`

Or run all five with `npm run check`.

The pre-commit hook (`.husky/pre-commit`) runs only the fast checks on staged files: Prettier and the 5000-token file limit. It does not replace `npm run check`.

Modules are deep modules: see [app/modules/README.md](./app/modules/README.md) before adding or importing one.

## When something breaks

| Symptom                                         | Cause                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on your own copy of this repo (the `origin` remote), never on `ai-hero-dev/cohort-005-project`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
