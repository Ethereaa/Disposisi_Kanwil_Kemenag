# Part 3 — Security Implementation Review

Consolidated engineering record for the first security fix
(`supabase/migrations/20260805000000_restrict_profile_role_changes.sql`,
commit `49761a6`). Written for whoever touches `profiles` next.

**Status: the migration is committed but has NOT been applied to any
database.** Everything below describes intended behaviour that is
reviewed but unverified. See "What must be verified in production".

---

## 1. The vulnerability

### Original state

`profiles` carries three row-scoped policies from
`20260728124412_create_profiles_table.sql`:

```sql
insert_own_profile : INSERT ... WITH CHECK (auth.uid() = id)
update_own_profile : UPDATE ... USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
delete_own_profile : DELETE ... USING (auth.uid() = id)
```

Each answers exactly one question: *is this your row?* None of them
constrain **which columns** you may write. At the time they were written
that was harmless — `profiles` held only `username` and `email`, and
lying about your own username escalates nothing.

`20260730150000_add_role_and_restrict_delete.sql` then added `role` to
that same table and made deletion of official records depend on it:

```sql
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                                        AND profiles.role = 'admin'))
```

Neither change is wrong in isolation. The vulnerability is emergent: a
security decision (`role`) was placed inside a table whose write policy
had already been declared self-service. The authorization boundary
became a value the subject controls.

### Exploit

One HTTP request with the anon key already published in the browser
bundle:

```
PATCH /rest/v1/profiles?id=eq.<own-uuid>
{"role":"admin"}
```

The attacker then satisfies every `admin_delete_*` policy on
`surat_masuk`, `surat_keluar`, and `agenda_pimpinan` — permanent deletion
of government correspondence, with no audit trail (there is none; see
audit finding #6).

The client-side guard `canDelete={user?.role !== 'staf'}`
(`src/App.tsx:402-404`) is presentation only and was never a control.

---

## 2. Why the first idea was insufficient

The original audit specified a trigger on **UPDATE** only. That reasoning
followed the exploit above and stopped there — it fixed the verb that had
been demonstrated rather than the capability being abused.

`delete_own_profile` and `insert_own_profile` are equally unrestricted, so
the same escalation is reachable without any UPDATE at all:

```
DELETE /rest/v1/profiles?id=eq.<own-uuid>     -- delete_own_profile: allowed
POST   /rest/v1/profiles                       -- insert_own_profile: allowed
{"id":"<own-uuid>","username":"x","email":"x@y","role":"admin"}
```

Two requests instead of one, identical outcome. An UPDATE-only trigger
would have produced a migration that *looks* like a fix, passes the
obvious test, and leaves the system exploitable — the worst possible
result, because it also removes the incentive to look again.

**Generalisable lesson: enumerate the ways a capability can be reached,
not the way it was first demonstrated.** The capability here is "write a
privileged value into my own row". It has two verbs.

---

## 3. Why the final solution is correct

One `BEFORE INSERT OR UPDATE` trigger sits on the table itself, so every
write path converges on it regardless of verb, client, or origin:

| Path | Result |
|---|---|
| `UPDATE ... SET role='admin'` as staf | `42501` |
| `DELETE` + `INSERT` with `role='admin'` as staf | `42501` on INSERT |
| `UPDATE ... SET username=...` as staf | allowed (role unchanged) |
| Signup via `handle_new_user()` | allowed (`role` defaults to `staf`) |
| Admin changing another user's role | allowed |
| SQL editor / service_role / migration | allowed |

The rule is stated once, in the database, and cannot be forgotten by a
future caller. A new client, a bulk import script, or a hand-run SQL
statement all inherit it without knowing it exists.

### Why INSERT specifically

Because `delete_own_profile` exists. If profile rows could not be
deleted by their owner, INSERT protection would be redundant — the row
already exists and only UPDATE could reach it. The two policies are only
dangerous **in combination**, which is precisely why the hole survived
the first analysis: reading either policy alone shows nothing wrong.

---

## 4. Why a trigger, not RLS

This deserves precision, because the audit's original phrasing ("RLS is
row-scoped, so this is not directly possible") was too strong. Two
alternatives genuinely exist:

### Alternative A — express it in the policy

Postgres RLS gives `UPDATE` policies a `USING` clause (evaluated against
the existing row) and a `WITH CHECK` clause (evaluated against the
proposed row). **Neither can see both at once**, so `OLD.role <>
NEW.role` is not directly expressible. It can be approximated:

```sql
WITH CHECK (auth.uid() = id
            AND role = (SELECT role FROM profiles WHERE id = auth.uid()))
```

Rejected: it depends on the subquery observing the pre-update snapshot,
which is a `READ COMMITTED` implementation detail rather than a stated
guarantee; it is difficult to read; it silently does the wrong thing if
isolation level changes; and it does not cover the INSERT path.

### Alternative B — column-level privileges

Postgres does support column-granular grants, and this would work:

```sql
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (username, email) ON profiles TO authenticated;
```

Rejected for a narrower reason: grants are per-**role**, and in Supabase
both admins and staff authenticate as the same Postgres role
(`authenticated`). Admins are not a Postgres role — "admin" is a value in
a column. So a column grant cannot say "deny for staff, permit for
admins"; it denies everyone equally, and promotion would then require a
separate `SECURITY DEFINER` RPC. That is two constructs where the trigger
is one.

**Chosen:** the trigger, because it is the only option that expresses the
complete rule — including the admin exception — in a single place, and
covers INSERT and UPDATE together.

Worth noting: column grants remain a good *defence-in-depth* addition
later. They are not an alternative to the trigger, but they would stack
with it.

---

## Engineering Decisions

| # | Decision | Reasoning |
|---|---|---|
| **D1** | Trigger over policy rewrite | `OLD`/`NEW` comparison is not expressible in RLS; approximations rely on snapshot semantics (§4A). |
| **D2** | Trigger over column-level `GRANT` | Grants are per-Postgres-role; admin/staf are column values sharing the `authenticated` role, so grants cannot encode the exception (§4B). |
| **D3** | `BEFORE INSERT OR UPDATE`, not `BEFORE UPDATE OF role` | `UPDATE OF` fires only when the column appears in the `SET` list. A security boundary must not depend on how a statement was written. The house style elsewhere (`20260803000000`) uses `UPDATE OF`, which is correct there — that trigger maintains a timestamp, it does not enforce a boundary. |
| **D4** | `SECURITY DEFINER` + `SET search_path = public` | The admin lookup must not depend on the caller's own `SELECT` policy. If `family_select_profiles` is ever tightened, an INVOKER function would find zero rows and deny *everyone*, including admins — breaking promotion. DEFINER makes the check deterministic. `search_path` pinning is mandatory hardening for DEFINER functions. |
| **D5** | Allow when `auth.uid() IS NULL` | Preserves the promotion workflow documented in `20260730150000` (SQL editor), plus service_role and migrations. Safe because `anon` also has a null `auth.uid()` but holds **no** INSERT/UPDATE policy on `profiles` — RLS rejects it before the trigger is reached. This is an explicit trust boundary, not an oversight (see Risk R2). |
| **D6** | `RAISE EXCEPTION`, not silently coercing `role` to `staf` | Silent coercion would make an attack indistinguishable from success and would mask bugs in legitimate callers. Loud failure is debuggable. |
| **D7** | No data migration — existing roles untouched | The migration is pure DDL. Changing roles is a separate operational decision requiring knowledge of who should hold admin. Bundling it would make rollback destructive. |
| **D8** | `ERRCODE = '42501'` (`insufficient_privilege`) | The standard SQLSTATE for this condition. PostgREST maps it to HTTP 403 rather than a generic 500, so the client receives a meaningful status. |
| **D9** | Indonesian error message | Matches every other user-facing string in the app (`storage.ts`, `db.ts`). The message surfaces through `getErrorMessage()` into a toast. |
| **D10** | `old_role` defaults to `'staf'` on INSERT | On INSERT there is no `OLD`. Comparing against `'staf'` means inserting a `staf` row is unconditionally fine, and inserting anything else requires authorization — the correct default-deny posture. |

---

## Security Lessons Learned

### Row-level security alone was insufficient

RLS answers *which rows* a subject may touch. It does not answer *which
columns*, and it has no opinion about whether a column is load-bearing
for authorization. `update_own_profile` was correct when written and
became a vulnerability when a later migration added a privileged column
to the same table. **The policy did not change; its meaning did.**

Any table whose write policy is "your own row" is unsafe as a home for
authorization data.

### Why column protection matters

The unit of a security decision is the column, not the row. Once one
column in a row governs privilege, "may edit this row" silently becomes
"may edit this privilege". Either protect the column explicitly, or move
it to a table with a different write policy. (A separate `user_roles`
table with no user-facing write policy at all would have prevented this
class of bug structurally — worth considering if `profiles` accretes more
privileged fields.)

### Why privilege escalation is dangerous

It is a *multiplier*, not a standalone bug. This one converts every other
weakness into a worse one: combined with open registration (audit #2), an
anonymous stranger reaches record deletion in three requests. Combined
with the absent audit trail (#6), the deletion is untraceable. Escalation
bugs deserve priority above issues that look individually more severe,
because they change the blast radius of everything else.

### Why fail-safe design is preferred

Two fail-open patterns exist in this codebase and were the reason the
audit ranked this fix first:

- `fetchProfile()` (`storage.ts:57`) resolves any unrecognised value to
  `'admin'`.
- The reminder Edge Functions run `if (CRON_SECRET && ...)` — an unset
  secret disables the check entirely.

Both make the *absence* of information grant privilege. The new trigger
inverts that: unknown or unauthorized state raises. When a security
control fails, it should deny and be noisy; a control that fails quietly
open is worse than none, because it is trusted.

### Why incremental security improvements reduce risk

This fix is 109 lines, touches one table, changes no application code and
no data, and reverts with a single `DROP TRIGGER`. It can be applied,
observed, and rolled back independently of the other four fixes. The
alternative — one large "security hardening" change — would couple a
low-risk trigger to a UI change and an RLS revocation, so that any
regression forces reverting all of it. Small, independently reversible
changes get deployed; large ones get postponed, and postponed security
work is unshipped security work.

---

## Future Maintenance Notes

### Never change these without understanding why they exist

1. **Do not add `role` (or any privileged column) to a table with a
   self-write policy** without a corresponding guard. This is the exact
   mistake that created the vulnerability.
2. **Do not weaken the trigger to `BEFORE UPDATE OF role`.** It reopens
   the INSERT path (§2).
3. **Do not remove `SET search_path = public`.** Mandatory for
   `SECURITY DEFINER`.
4. **Do not "simplify" by dropping the `auth.uid() IS NULL` branch** —
   that breaks admin promotion from the SQL editor and from migrations.
5. **Do not re-run `20260730150000_add_role_and_restrict_delete.sql`
   against a live database.** Line 31 is
   `UPDATE profiles SET role='admin' WHERE role IS NULL OR role='staf'`,
   which promotes **every current staff member to admin**. It is a
   one-time backfill that is not idempotent in the way its
   `IF NOT EXISTS` neighbours are. The new trigger will not stop it —
   migrations run with a null `auth.uid()` (D5).

### Test before modifying `profiles`

Run all of these against staging. Each maps to a way the fix has already
nearly failed:

```sql
-- 1. staf cannot self-promote (the original exploit)
--    expect: 42501
update profiles set role = 'admin' where id = auth.uid();

-- 2. staf cannot escalate via delete + re-insert (the bypass)
--    expect: 42501 on the insert
delete from profiles where id = auth.uid();
insert into profiles (id, username, email, role)
values (auth.uid(), 'x', 'x@y.z', 'admin');

-- 3. ordinary profile edits still work (regression)
--    expect: success
update profiles set username = 'new-name' where id = auth.uid();

-- 4. signup still works (regression)
--    expect: profile row created with role = 'staf'

-- 5. admin can still change roles (regression)
--    expect: success
update profiles set role = 'staf' where username = '<someone>';

-- 6. SQL-editor promotion still works (D5)
--    expect: success
update profiles set role = 'admin' where username = '<someone>';
```

### How future migrations should handle roles

- Role changes belong in migrations or the SQL editor (null `auth.uid()`),
  **never** in client-reachable code paths.
- If the app ever needs an in-app admin UI for role management, add a
  `SECURITY DEFINER` RPC that performs its own admin check. Do **not**
  relax the trigger to accommodate it.
- If a third role is introduced, update the `profiles_role_check`
  constraint **and** re-read this trigger — `old_role` defaults to
  `'staf'` on INSERT (D10) and that assumption may need revisiting.
- Prefer moving roles to a dedicated table over adding more privileged
  columns to `profiles`.

### Common mistakes to avoid

- Assuming RLS covers column-level concerns. It does not.
- Assuming the client-side role check is a control. It is cosmetic.
- Testing only the exploit you know about (§2).
- Adding a `SECURITY DEFINER` function without pinning `search_path`.
- Treating "the policy is unchanged" as "the policy still means what it
  meant".

---

## 5. Critique of this implementation

### Assumptions made

| # | Assumption | If wrong |
|---|---|---|
| A1 | `auth.uid()` returns `NULL` for service_role, SQL editor, and migrations | Admin promotion breaks entirely. **Highest-value thing to verify.** |
| A2 | `anon` cannot reach INSERT/UPDATE on `profiles` | D5's escape hatch becomes an anonymous bypass. Verified by reading the policies (all are `TO authenticated`), not by execution. |
| A3 | At least one admin exists | See R1. |
| A4 | PostgREST maps `42501` to HTTP 403 | Cosmetic only; the write is still rejected. |
| A5 | No existing code writes `role` from a client path | A regression would surface as a user-visible `42501`. `grep` over `src/` shows no client write to `role`. |

### Risks that remain

- **R1 — Admin lockout.** If the last admin is demoted, no authenticated
  user can ever promote anyone again; recovery requires the SQL editor.
  Not introduced by this fix (the DELETE policies had the same property),
  but the trigger makes it sharper. A `CHECK` that at least one admin
  survives would need a statement-level trigger; deferred as
  disproportionate.
- **R2 — The `auth.uid() IS NULL` trust boundary.** Any future Edge
  Function that uses the service_role key and accepts a user-supplied
  role value bypasses this control completely. This is inherent to
  service_role, but D5 widens the surface and should be documented
  wherever service_role is used.
- **R3 — Self-deletion still permitted.** `delete_own_profile` remains.
  A user can delete their own profile row, which signs them out
  (`getCurrentUser()` returns `null` at `storage.ts:73-76`) and orphans
  their `auth.users` entry. No longer an escalation, but messy. Out of
  scope deliberately.
- **R4 — Unverified.** No database was available; the SQL is reviewed,
  not run.
- **R5 — Fail-open client default persists.** `fetchProfile()` still
  defaults to `'admin'` (`storage.ts:57`). Cosmetic now that the database
  enforces the boundary, but it is scheduled inside Fix 2 and should not
  be forgotten.

### What could still be improved

- Column-level `GRANT`s as defence-in-depth on top of the trigger (§4B).
- Moving `role` to a dedicated `user_roles` table with no user-facing
  write policy — structural rather than defensive.
- `pgTAP` coverage of the six checks above, so this cannot silently
  regress. Currently there are no tests of any kind in this repository.
- An audit-log row on every role change (couples naturally with audit
  finding #6).

### What must be verified in production

1. **Apply the migration.** It is committed and inert; the vulnerability
   is open until it runs.
2. Execute all six checks from "Test before modifying `profiles`".
3. Confirm A1 specifically — attempt a promotion from the SQL editor.
4. Confirm no legitimate flow now returns `42501` (watch for toasts
   containing the Indonesian message).
5. Audit who currently holds `admin`. `20260730150000` promoted
   **everyone** who existed at that time, so the current admin set is
   almost certainly wider than intended — likely every staff member.
   This fix locks in whatever that set is.

> Point 5 deserves emphasis: hardening role changes while every user is
> already an admin achieves little. Reviewing and reducing the admin set
> is probably worth more than the trigger itself, and it is not something
> I can determine from the repository.

---

## 6. Updated roadmap

Fix 1 shipped (uncommitted to any database). Re-estimated:

| # | Fix | Effort | Impact | Impl. risk | Notes |
|:--:|---|:--:|:--:|:--:|---|
| — | **Apply Fix 1 to the database** | Trivial | **Critical** | Low | Everything below assumes this happened. Currently the highest-value action available. |
| 2 | Disable public registration | Small | **Critical** | Low | Dashboard toggle + delete the "Daftar" tab + flip `storage.ts:57`. **Still blocked on: are email signups enabled?** If already disabled, impact drops to Low and this is dead-UI cleanup. |
| 3 | Revoke `anon` SELECT on `agenda_pimpinan` | Trivial | High | **Medium** | One `DROP POLICY`. Risk is operational, not technical: it breaks any kiosk display in daily use. Confirm before running. |
| 4 | Backup restore drops agenda | Small | High | Low | ~4 lines. Self-contained, no schema change. Consider disabling the restore button until it lands. |
| 5 | Reminder auth fails open | Trivial | Medium | **Medium** | One line × 2 files. Must confirm `CRON_SECRET` is set in both function environments **first**, or reminders stop dead. |

### Recommended order (revised)

`Apply Fix 1` → `4` → `2` → `5` → `3`

Changed from the original review. Fix 4 moves up: it is the only
remaining item that is pure application code with no external dependency,
no dashboard question, and no operational blast radius — it can ship
while the answers to 2, 3, and 5 are still outstanding. Fixes 3 and 5
both carry a "confirm something outside the repo first" precondition and
should not block the queue.

### Still outstanding, unchanged since the first audit

- **Are Supabase email signups enabled?** (gates Fix 2)
- Is a kiosk/lobby display in active use? (gates Fix 3)
- Is `CRON_SECRET` set in both Edge Function environments? (gates Fix 5)
- `.claude/prompts/` is committed and public, and documents these
  unpatched vulnerabilities in exploitable detail.
