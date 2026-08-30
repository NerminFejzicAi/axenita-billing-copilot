/**
 * The concrete `TenantDatabaseService` facade (D-006; D-054 part C; D-056 part A; D-072
 * `OD-P5-I4-13`; D-073).
 *
 * WHY IT EXISTS NOW AND NOT BEFORE
 *
 * D-056 clause 4 deferred the concrete class CONDITIONALLY: the obligation activates "kada
 * stvarni tenant business modul zatraži tu apstrakciju", not on the arrival of any phase number.
 * `P5-I4A` is that module. The patient-reference read is the first business slice that needs to
 * issue its OWN statement against the admitted tenant, so the abstraction is now genuinely
 * requested and the class is now genuinely load-bearing. Introducing it earlier would have been
 * the empty class D-054 refused: "facade koji ne posjeduje klijent, ne otvara transakciju i ne
 * drži konekciju dodao bi ime bez svojstva".
 *
 * WHAT PROPERTY IT ADDS, PRECISELY
 *
 * ONE: A FEATURE ADAPTER CANNOT REACH THE DATABASE BEFORE ADMISSION. The only way to obtain an
 * {@link AdmittedTenantSession} is {@link TenantDatabaseService.forAdmittedRequest}, and that
 * method requires an `AdmittedTenantRequest` — a frozen value object that only
 * `TenantRequestPipeline.admit` returns, and only after every step of `03` §3.7.1 up to and
 * including the required permission has passed. There is no other constructor, no other factory
 * and no injectable token for one. "Admitted" therefore stops being a convention a route has to
 * remember and becomes a value a feature adapter cannot fabricate.
 *
 * TWO: THE ADMITTED PRACTICE IS THE ONLY PRACTICE A FEATURE STATEMENT IS GIVEN. The session
 * carries `practiceId` — the value now in `app.practice_id` — so the explicit tenant predicate
 * D-073 requires as the second barrier is written from the admitted value by construction, and a
 * path segment, a header or a body member is not in scope to write it from.
 *
 * WHAT IT DELIBERATELY IS NOT (D-054 clauses 6–10; D-056 clause 5; D-073)
 *
 *     owns a PrismaClient          NO   it has no constructor dependencies at all
 *     owns a PrismaService         NO   the same
 *     opens a transaction          NO   it wraps the one already open
 *     opens a nested transaction   NO   there is no transaction API on this class
 *     bootstraps identity          NO   `set_auth_subject_context`/`set_user_context` are absent
 *     sets app.practice_id         NO   `set_request_context` is absent; it only READS the
 *                                       admitted value the pipeline established
 *     accepts caller identity      NO   there is no `userId` parameter anywhere below
 *     holds feature SQL            NO   the patient-reference statement lives in the feature
 *                                       adapter and is passed through, never built here
 *
 * IT IS A FACADE, NOT A FRAMEWORK. `forAdmittedRequest` takes no callback and exposes no hook,
 * so no caller can reorder, skip or interleave the admission chain through it. It returns a
 * frozen object with one value and one method.
 *
 * `IdentityBootstrapSession` IS NOT RENAMED AND NOT GENERALISED for `P5-I4A` (D-073). It remains
 * the pinned-session boundary it already was; this class narrows it, and narrowing is the whole
 * of what it does.
 */

import { Injectable } from '@nestjs/common';

import { type AdmittedTenantRequest } from '../identity/application/tenant-request.pipeline.js';
import { type IdentityBootstrapSession } from '../identity/infrastructure/identity-database.port.js';
import { type AdmittedTenantSession, type TenantStatement } from './tenant-statement.js';

@Injectable()
export class TenantDatabaseService {
  /**
   * Narrows ONE admitted tenant request to the statement surface a feature adapter may use.
   *
   * @param session the pinned session of the ALREADY-OPEN authenticated transaction. It cannot
   *   be constructed by a caller and exists only inside
   *   `IdentityBootstrapService.runAuthenticatedSession`, so this facade cannot manufacture a
   *   database context of its own even in principle.
   * @param admitted the frozen outcome of `TenantRequestPipeline.admit`. Requiring it — rather
   *   than a bare practice id — is the point: a practice id is a string anyone can produce,
   *   while this object exists only downstream of the complete `03` §3.7.1 chain.
   */
  public forAdmittedRequest(
    session: IdentityBootstrapSession,
    admitted: AdmittedTenantRequest,
  ): AdmittedTenantSession {
    // THERE IS NO IDENTITY PARAMETER, AND NONE MAY BE ADDED (D-054 clause 10, D-056 clause 5
    // point 5). The only identity on this path is the transaction-local `app.user_id` the
    // session already established; a `userId` argument here would restore the exact seam
    // D-054 clause 12 required removed from the pipeline.
    return Object.freeze({
      // Read from the ADMITTED request, never from a route input. This is the value the
      // pipeline put into `app.practice_id`, so the explicit predicate a feature statement
      // writes and the tenant policy the database applies agree by construction.
      practiceId: admitted.practiceId,

      // A pass-through, and nothing more. The statement is the feature's; the connection is the
      // session's. This method adds no SQL, no table, no predicate and no transaction.
      run: async <TRow>(statement: TenantStatement): Promise<readonly TRow[]> =>
        session.runTenantStatement<TRow>(statement),
    });
  }
}
