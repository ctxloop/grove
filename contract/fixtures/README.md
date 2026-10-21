# Contract fixtures

Sample files for the data contract in `docs/architecture.md` §4. Field names are the real format; values are made up to cover edge cases.

- Tests on both sides decode them: Go in `pipeline/internal/export`, TS in `web/src/world/schema.ts`.
- Change a format in all three places together: these fixtures, the Go types, and the TS parser.
- Bump `schema` with every format change, so the browser rejects old data instead of half-reading it.
