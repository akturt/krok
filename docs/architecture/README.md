---
schema: 1
id: architecture-readme
type: architecture
status: active
date: 2026-07-09
owners: [underboss-team]
---

# Architecture Overview

## Project Identity

- Name: underboss
- Domain: unknown
- Stack: unknown

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | TBD |
| Database | TBD |
| Infrastructure | TBD |

## Project Layout

```
underboss/
  docs/
    architecture/     # topology, domain model, invariants
    adr/              # Architecture Decision Records
    specs/            # specifications (draft в†’ review в†’ approved в†’ implemented)
    audits/           # audit reports, reality checks
    backlog/          # backlog, TODO, wishlist
    api/              # API documentation
  src/                # application source code
  tests/              # tests
  .context/           # agent entry metadata
```

## Boundaries

See `.context/boundaries.yml` for detailed boundary definitions.

- **Pristine**: docs/.control/
- **Editable**: docs/** (except docs/.control/), src/, tests/
- **Generated**: .context/*, CLAUDE.md, node_modules/
- **Secret**: .env, *.key, *.pem

## See Also

- [ADR](../adr/) вЂ” Architecture Decision Records
- [Backlog](../backlog/) вЂ” TODO, Wishlist, Experiments
- [Boundaries](../../.context/boundaries.yml) вЂ” Boundary definitions
