import { Module } from '@nestjs/common';

import { AuditWriterService } from './application/audit-writer.service.js';
import { AuditDatabase } from './infrastructure/audit.database.js';

/**
 * The append-only audit trail — the `P5-I4C` writer (`01` §6.13; `04` §7.5a.3; `05` §6
 * `Services → audit`; D-072; D-079 `RULING B` item 3).
 *
 * `01` §6.13 names `audit` as a module of this architecture, and this is that module, opened at
 * the point the first genuine writer exists rather than earlier: an audit module with no event to
 * record would have been a name without a property, exactly the empty facade D-054 refused.
 *
 * WHAT IT CONTAINS: the ONE append-only statement and the ONE writer that builds a minimised,
 * self-hashed event from it.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN
 *
 * - no timeline, no audit package and no export. `01` §6.13 lists them as the module's eventual
 *   surface; none is authorised by `P5-I4C` and none is stubbed here (`04` §3.4);
 * - no integrity CHAIN. Phase 5 is `SELF-HASH ONLY` and D-069 `RULING 5` defers predecessor
 *   chaining — chain scope, ordering, locking, concurrent writers, fork prevention, retention and
 *   genesis semantics — to its own governance decision. `previous_event_sha256` is written as
 *   `null` and the writer has no way to express anything else;
 * - no `UPDATE` and no `DELETE` path, because `copilot_app` holds neither grant (`02` §29.4a.4);
 * - no read surface. Cross-practice readability of `audit_events` is categorically forbidden
 *   (D-063 clause 5) and no route in this slice reads the table at all;
 * - no `PrismaService`, no `PrismaClient` and no transaction of its own. The writer runs on the
 *   caller's admitted pinned session, which is what makes business and audit atomic.
 */
@Module({
  providers: [AuditWriterService, AuditDatabase],
  exports: [AuditWriterService],
})
export class AuditModule {}
