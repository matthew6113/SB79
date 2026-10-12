# @zoning-envelope/law

The single source of truth for every legal number in this monorepo.

- `sb79.json`: SB 79 (Gov. Code §§ 65912.155–65912.162) as a tree of cited
  leaves. Each leaf has a `value`, one pinpoint `cite`, the `source` snapshot
  it comes from, and a verbatim `quote` from that pinpoint. Leaves with
  `from`/`to` dates, and provisions with `versions`, encode the 2026
  amendments (SB 722 now; AB 2576 and SB 1361 from January 1, 2027).
- `source/`: official text from the Legislature's bulk database
  (`pnpm --filter @zoning-envelope/law fetch-statute`). Evidence; never edit.
- `src/`: the zod schema, `lawAsOf(date)`, and `evaluateSite(inputs, { asOf })`,
  which runs the seven steps of SB79_SPEC.md "How the law decides".
- `VERIFICATION.md`: where the spec and the statute differ.

Tests (`pnpm test`) check the calculator cases, and that every quote appears at
its cited pinpoint, states its value, and that no number in `sb79.json` lacks a
citation.
