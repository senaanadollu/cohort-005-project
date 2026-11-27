---
name: database-migrations
description: Database schema changes — generate the migration, update the seed, reseed. Use when editing `app/db/schema.ts`, when adding or altering a table, column, or enum, or when `npm run db:seed` fails to start.
---

# Database Migrations

The database is **disposable**. `data.db` is gitignored and holds nothing but seed data, so every schema change is free: migrate, throw the file away, reseed from scratch.

Disposable is also why the seed script is part of every schema change rather than a follow-up. `scripts/seed.ts` is the entry point that runs the sections in order; the data lives in `scripts/seed/`, one file per area (`users.ts`, `quizzes.ts`, `courses/<course>.ts`, …). The seed script is the definition of the starting data, and it recreates the whole database on each run — so a schema change that skips it produces data whose shape no longer matches the schema.

## Steps

1. **Edit the schema** — `app/db/schema.ts`.

2. **Generate the migration** — `npm run db:generate`. This writes a new numbered SQL file into `drizzle/`. Read it and confirm it says what you intended.

3. **Update the seed** for every table you touched. Find the insert sites with `grep -rn "schema.<table>" scripts/seed`:
   - **New table** — add a `DROP TABLE IF EXISTS` line to `dropAllTables()` in `scripts/seed/database.ts`, positioned above the tables it has foreign keys into (children drop first). Insert its rows in the `scripts/seed/` file for that area, or in a new file there with a `seed<Area>()` function called from `seed()` in `scripts/seed.ts`. Call order matters: later sections read ids that earlier ones insert.
   - **New non-nullable column** — give it a value in every `.values({ ... })` call for that table.
   - **Renamed or removed column** — rename or remove it at every insert site for that table.
   - **New enum** — import it from `app/db/schema` (the relative path depends on the file: `../../app/db/schema` from `scripts/seed/`) and use its members at the insert sites, matching how `UserRole` and `CourseStatus` are used.

4. **Reseed** — `npm run db:seed`. It drops every table, replays the migrations in `drizzle/`, and reinserts. It prints a summary of row counts when it finishes.

5. **Typecheck** — `npm run typecheck`.

Done when every table changed in step 1 is accounted for in step 3, `npm run db:seed` prints its summary, and the typecheck passes.

## When the seed fails to start

A half-applied migration can leave `data.db` in a state the seed cannot drop its way out of. Delete it and reseed:

```bash
rm -f data.db data.db-shm data.db-wal
npm run db:seed
```

Nothing is lost — the file is rebuilt from `drizzle/` and the seed script.

## `npm run db:migrate`

`npm run db:migrate` applies pending migrations to the existing `data.db`, preserving the rows already in it. The seed already migrates before it inserts, so the steps above never need it. Reach for it when you specifically want to watch a migration land on existing data.
