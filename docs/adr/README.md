# Architecture Decision Records

This directory records OddLink's design decisions as ADRs (Architecture Decision Records).
The goal is to make it possible to trace later not only "what was chosen" but also "why, compared with what, and what was given up".

## Rules

- One decision per file. File names are `NNNN-short-kebab-case.md` (numbers are sequential, with no gaps).
- ADRs are written in English.
- Status moves from `Proposed` to `Accepted` or `Rejected`. To overturn an accepted ADR, do not rewrite it: write a new ADR and mark the old one `Superseded by NNNN`.
- The owner makes the final decision. The author of an ADR goes only as far as writing the recommended option.
- Prices and limits of external services change, so always write the source URL and the date checked. Facts that could not be verified are marked "Unverified" and are not used as grounds for the decision.
- This repository is public. Do not write rate-limit thresholds, abuse-detection methods, secrets, or unfixed vulnerabilities.

## Template

```markdown
# NNNN. Title

- Status: Proposed
- Date: YYYY-MM-DD
- Related: #issue

## Context
(What the product needs. Start from user, feature and budget requirements, before technology)

## Requirements
(must / should)

## Options
(For each: verified facts and sources, what it gives us, what it rules out, cost, changes needed in this repository, lock-in)

## Decision (proposed)
(The recommended option and why; the runner-up and the conditions for switching to it)

## Consequences
(Impact on existing issues, CI and environment variables; follow-up issues to create)

## Open questions / risks
```

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-deploy-target.md) | Deploy target (hosting and Postgres) | Accepted |
| [0002](0002-link-lifecycle-and-control.md) | Link lifecycle and control (disable, delete, who may do it) | Accepted |
| [0003](0003-optional-accounts.md) | Optional accounts and link ownership | Accepted |
| [0004](0004-rate-limiting.md) | Rate limiting for link issuance | Accepted |
