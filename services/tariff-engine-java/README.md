# services/tariff-engine-java — placeholder

Deployment unit reserved for the isolated Java tariff service (01 §5.2, 00 §4.5).

## Status

**Not implemented.** Phase 1 creates the directory only (04 §3.3: `services/tariff-engine-java
placeholder`). No build file, no source, no Docker service.

## Planned responsibilities (not phase 1)

- load the licensed OAAT release;
- validate the internal evaluation request contract (03 §30);
- call CaseMaster / Grouper / Mapper;
- normalise the response and expose the raw result;
- expose health and release status.

Explicitly **not** responsible for users, tenant authorization, medical documents, approval,
Axenita or audit UI.

## Blocking external dependency

The official OAAT TarifMatcher package, licence and distribution rights are unresolved
(D-OPEN-010, 13 §6). No official tariff logic may be re-implemented from secondary
documentation. Until the package is available the core backend uses a mock tariff engine,
introduced in phase 8 (04 §10).

## Toolchain (when implementation starts)

- Java 21 LTS;
- Spring Boot wrapper or an equivalent minimal HTTP service;
- never reachable directly from a browser (00 §4.5).
