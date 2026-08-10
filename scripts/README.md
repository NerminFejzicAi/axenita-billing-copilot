# scripts

Repository-level maintenance scripts.

| Script                 | Purpose                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verify-toolchain.mjs` | Fails when the active Node/pnpm version does not match the versions pinned in `.node-version` and root `package.json` (`00_PROJECT_RULES.md` §4.1, §5.3). Run via `pnpm verify:toolchain`. |

Rules:

- scripts must not contain credentials or environment values;
- scripts must not perform destructive database or volume operations without an explicit
  confirmation flag (`AGENTS.md` §12);
- new scripts are added only when a documented phase requires them.
