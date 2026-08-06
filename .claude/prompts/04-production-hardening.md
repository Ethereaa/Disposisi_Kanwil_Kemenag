# Part 4 — Production Hardening

## Operating Mode

Act as the lead production engineer responsible for making this application safer without destabilizing existing workflows.

Use deep reasoning and inspect all relevant evidence before editing.

High-effort reasoning means:

* investigate more thoroughly
* challenge initial assumptions
* trace all relevant callers
* identify hidden failure paths
* distinguish confirmed facts from assumptions
* verify the final implementation carefully

High-effort reasoning does **not** mean:

* expanding the approved scope
* redesigning unrelated systems
* fixing every issue encountered
* touching extra files for cleanliness
* creating speculative abstractions
* performing large refactors
* combining multiple fixes

The objective is the smallest correct production change, supported by strong evidence.

---

# Repository Location

The project is located at:

```text
C:\Users\Administrator\Downloads\Disposisi_Kanwil_Kemenag-main\Disposisi_Kanwil_Kemenag-main
```

When giving the user a PowerShell command, always provide a complete copy-paste block beginning with:

```powershell
cd "C:\Users\Administrator\Downloads\Disposisi_Kanwil_Kemenag-main\Disposisi_Kanwil_Kemenag-main"
```

Do not assume the user is already in the correct directory.

Do not place the `cd` command on the same line as another command.

Do not prefix ordinary instructions to Claude Code with `!`. The `!` prefix sends text to the shell.

---

# Current Repository State

The following work has already been completed.

## Fix 1 — Profile Role Escalation

Completed:

* Created migration `20260805000000_restrict_profile_role_changes.sql`
* Protected both `INSERT` and `UPDATE` paths for `profiles.role`
* Committed as:

```text
49761a6 fix(auth): prevent profile role escalation
```

* Migration history is synchronized locally and remotely.
* Local and remote both record migration version:

```text
20260805000000
```

Do not recreate, replace, or redesign this fix.

## Fix 2 — Public Self-Service Registration

Completed:

* Removed the registration interface from `AuthScreen.tsx`
* Removed `registerUser()` from `storage.ts`
* Changed unknown profile roles to fail closed as `staf`
* Preserved existing login behavior
* Committed and pushed as:

```text
f719d46 fix(auth): remove public self-service registration
```

Do not revisit or refactor this fix unless the current task reveals a direct regression.

## Dependency Lockfile

`package-lock.json` was synchronized with `package.json`.

Committed and pushed as:

```text
8673497 chore: synchronize package lockfile
```

## Git State

The repository was clean and synchronized with `origin/main` before beginning this task.

Do not modify:

* `.claude` prompt files
* security-review documentation
* `package-lock.json`
* dependency versions
* previous migrations

unless the current fix absolutely requires it.

---

# Known Pre-Existing Validation Baseline

The repository has existing validation failures unrelated to the current task.

## TypeScript Baseline

Four TypeScript diagnostics were previously reported across three files:

* `src/components/ui/AttachmentField.tsx`

  * drag-event element type mismatch
* `src/pages/AgendaPimpinanForm.tsx`

  * `FieldProps` does not accept `className`
* `src/pages/AgendaPimpinanPreview.tsx`

  * two diagnostics involving `navigator.share`

## ESLint Baseline

The repository also has pre-existing lint errors and warnings in unrelated files.

One known example is:

```text
src/lib/storage.ts
metadata?: any
@typescript-eslint/no-explicit-any
```

These existing failures are not part of Fix 4.

Do not repair them as part of this task.

When validating Fix 4:

* identify whether a failure existed before the current change
* separate baseline failures from newly introduced failures
* do not claim that the whole repository passes when it does not
* do not allow unrelated failures to expand the current scope

---

# Approved Remaining Production Fixes

The remaining approved fixes are:

1. Fix 4 — Repair backup restoration of Agenda Pimpinan
2. Fix 5 — Make reminder authentication fail closed
3. Fix 3 — Revoke anonymous Agenda Pimpinan access after confirming no public display depends on it

Implement **Fix 4 only** during this execution.

Do not begin Fix 5.

Do not begin Fix 3.

---

# Current Task — Fix 4

## Title

Repair Backup Restore for Agenda Pimpinan

## Confirmed Problem

The backup system parses and displays the number of Agenda Pimpinan records found in a backup.

However, the restore operation currently clears and restores only:

* Surat Masuk
* Surat Keluar

Agenda Pimpinan records are counted and shown to the user but are not written back to the database.

The user may receive a successful restoration message while all Agenda Pimpinan records remain missing.

This is silent data loss combined with misleading success feedback.

## Objective

Ensure that a valid backup restores all supported record groups:

* Surat Masuk
* Surat Keluar
* Agenda Pimpinan

The implementation must preserve the existing backup format and existing behavior for Surat Masuk and Surat Keluar.

---

# Hard Scope Boundaries

For Fix 4:

## Allowed

* Modify `src/pages/BackupPage.tsx`
* Modify the smallest required type or helper declaration in `src/lib/db.ts`
* Add the existing `bulkInsertAgendaPimpinan` helper to the restore flow
* Allow `clearTable` to accept the Agenda Pimpinan table if necessary
* Correct a misleading success count or message only if required by the fix
* Add narrowly scoped comments explaining non-obvious data-integrity behavior

## Not Allowed

* Redesign the entire backup system
* Create a new backup-file format
* Add dependencies
* Change authentication
* Change RLS
* Modify unrelated pages
* Change export formatting
* Redesign attachments
* Introduce soft deletes
* Build a new transactional restore architecture
* Fix existing TypeScript or ESLint failures outside the touched code
* Edit historical migrations
* Change Git history
* Commit or push automatically

If a full database transaction would be better but is not required for the minimal repair, document it as remaining technical debt and keep the current change small.

---

# Phase 1 — Evidence Collection

Before editing, inspect all relevant code.

Read at minimum:

* `src/pages/BackupPage.tsx`
* `src/lib/db.ts`
* the backup parser
* backup data types
* backup export logic
* `bulkInsertMasuk`
* `bulkInsertKeluar`
* `bulkInsertAgendaPimpinan`
* `clearTable`
* `confirmRestore`
* every caller of `clearTable`
* every caller of `bulkInsertAgendaPimpinan`

Search the repository for:

```text
confirmRestore
clearTable
bulkInsertMasuk
bulkInsertKeluar
bulkInsertAgendaPimpinan
agendaPimpinan
parseBackup
```

Determine:

1. The exact backup object structure.
2. Whether `agendaPimpinan` is always present or optional.
3. How empty arrays are handled.
4. Whether attachments are restored as metadata only.
5. Whether insert helpers accept backup objects directly.
6. Whether any date or field conversion occurs.
7. Whether restoring currently clears tables before inserting.
8. Whether the current restore sequence is atomic.
9. Whether the displayed restored counts reflect actual writes.
10. Whether any existing helper already solves the required task.

Do not edit before this inspection is complete.

---

# Phase 2 — Root-Cause Analysis

State the confirmed root cause before implementation.

Distinguish between:

* the backup parser recognizing Agenda Pimpinan
* the confirmation UI displaying Agenda Pimpinan counts
* the restore function failing to clear or insert Agenda Pimpinan data

Confirm whether the defect is:

* a missing import
* a missing `clearTable` call
* a missing bulk-insert call
* an overly narrow table type
* a combination of those items

Do not assume the earlier audit is perfectly accurate. Verify it against the current committed files.

If the earlier proposed four-line fix is incomplete, explain why before changing the plan.

---

# Phase 3 — Implementation Plan

Before editing, provide a concise implementation plan containing:

* exact files to modify
* exact functions to modify
* why each modification is required
* expected number of changed lines
* implementation risk
* likely regression surface
* whether database migrations are required
* rollback method

Do not ask for approval if:

* the scope remains Fix 4 only
* no more than five files are involved
* no destructive production action is required
* the implementation follows the constraints in this document

Proceed after presenting the plan.

Stop and request approval only if:

* more than five files must change
* a database migration becomes necessary
* the backup format must change
* destructive production testing is required
* the solution requires a major redesign

---

# Phase 4 — Implementation Requirements

The implementation should likely include the following, but verify before applying:

1. Import `bulkInsertAgendaPimpinan` into `BackupPage.tsx`.
2. Include `agenda_pimpinan` in the restore clearing process.
3. Insert `backup.agendaPimpinan` during restoration.
4. Widen the accepted table type for `clearTable` only if needed.
5. Preserve existing Surat Masuk restoration.
6. Preserve existing Surat Keluar restoration.
7. Preserve the existing backup parser.
8. Preserve the existing backup-file version and structure.
9. Ensure an empty Agenda Pimpinan array does not fail.
10. Ensure success feedback is shown only after every required insertion completes.

Use the exact field and table names found in the repository.

Do not invent new names.

Do not silently swallow insertion errors.

Do not claim transaction safety if the operation remains sequential.

---

# Non-Atomic Restore Risk

The current restore may perform sequential destructive operations:

1. clear one or more tables
2. insert restored records
3. continue to the next table

If an operation fails midway, the database may be partially restored.

For this fix:

* determine the exact current behavior
* do not make it worse
* do not redesign it unless necessary
* state clearly whether restore remains non-atomic
* document what partial-failure scenarios remain possible
* recommend a future transactional database function if appropriate

Do not claim that rollback occurs unless actual rollback logic exists.

---

# Phase 5 — Diff Review

After editing:

1. Re-read every modified file in full or around every changed region.
2. Search for dangling imports.
3. Search for unused imports.
4. Search for every call to the modified helpers.
5. Verify no unrelated code changed.
6. Show a concise diff summary.
7. List every modified file.
8. Explain every change.
9. Confirm whether the change matches the initial plan.
10. Explicitly disclose any deviation from the plan.

Do not create documentation files as a side effect of this fix.

Keep the engineering report in the response unless explicitly asked to save it.

---

# Phase 6 — Validation

Run the narrowest useful validation available.

Preferred checks:

```powershell
cd "C:\Users\Administrator\Downloads\Disposisi_Kanwil_Kemenag-main\Disposisi_Kanwil_Kemenag-main"

npm run typecheck
npm run lint
npm run build
```

Because the repository has pre-existing failures:

* attribute each diagnostic to a file
* determine whether that file was modified by Fix 4
* identify any newly introduced error
* do not fix unrelated baseline errors
* run focused ESLint checks against modified TypeScript files where useful

Example focused check:

```powershell
cd "C:\Users\Administrator\Downloads\Disposisi_Kanwil_Kemenag-main\Disposisi_Kanwil_Kemenag-main"

npx eslint src/pages/BackupPage.tsx src/lib/db.ts
```

If command execution is blocked because the model-safety classifier or AgentRouter is unavailable:

* do not fabricate command results
* continue with read-only inspection
* report exactly which checks could not run
* provide the user with a complete PowerShell command block beginning with the full project path
* do not repeatedly retry the same blocked command without new reason

---

# Manual Verification Plan

Do not perform destructive restoration against production without explicit approval.

Provide a manual test plan covering:

## Standard Round Trip

1. Use a safe test project or test data.
2. Create known records in:

   * Surat Masuk
   * Surat Keluar
   * Agenda Pimpinan
3. Export a backup.
4. Record the count for each record group.
5. Restore the backup.
6. Verify all three groups return.
7. Compare restored fields with the original records.
8. Confirm Agenda Pimpinan attachments or attachment metadata are preserved according to the existing backup design.
9. Confirm the success message appears only after all inserts succeed.

## Empty Agenda Case

1. Use a backup with an empty `agendaPimpinan` array.
2. Restore it.
3. Confirm no error occurs.
4. Confirm the resulting Agenda Pimpinan table matches the intended restore behavior.

## Invalid Backup Case

1. Use malformed or invalid backup data in a safe environment.
2. Confirm validation rejects it.
3. Confirm the application does not report a false success.

## Partial Failure Awareness

Describe what happens if:

* Surat Masuk succeeds
* Surat Keluar succeeds
* Agenda Pimpinan insertion fails

If the operation remains non-atomic, state that explicitly.

---

# Git Safety Rules

Do not commit automatically.

Do not push automatically.

Do not use:

```text
git add .
```

After validation, recommend explicit staging paths.

The expected staging command will likely be:

```powershell
cd "C:\Users\Administrator\Downloads\Disposisi_Kanwil_Kemenag-main\Disposisi_Kanwil_Kemenag-main"

git add src/pages/BackupPage.tsx src/lib/db.ts
git diff --cached
```

Adjust the explicit file list only if the actual implementation modifies different approved files.

Recommended commit-message format:

```text
fix(backup): restore agenda pimpinan records
```

---

# Required Final Report

After implementing Fix 4, provide exactly these sections:

## Fix 4 Status

State whether implementation is complete, partial, or blocked.

## Confirmed Root Cause

Explain the defect based on current code.

## Files Modified

List every modified file.

## Changes Made

Explain each modification precisely.

## Why the Fix Is Safe

Explain how existing Surat Masuk and Surat Keluar behavior is preserved.

## Remaining Risks

Include non-atomic restore behavior if it remains.

## Validation Performed

List commands actually executed and their real results.

## Validation Not Performed

List blocked or unavailable checks.

## Manual Verification

Provide the test procedure.

## Rollback

Explain how to revert the change.

## Recommended Commit

Provide:

* exact staging command with full project path
* exact commit message
* no push command unless the user asks

## Out-of-Scope Findings

List any additional findings without fixing them.

## Stop

Stop after reporting.

Do not commit.

Do not push.

Do not begin Fix 5.

Do not begin Fix 3.

---

# Future Queue — Do Not Execute Now

After Fix 4 is validated and approved:

## Fix 5

Make reminder Edge Function authentication fail closed.

Precondition:

* verify `CRON_SECRET` exists in every relevant function environment

## Fix 3

Remove anonymous Agenda Pimpinan access.

Precondition:

* verify no active kiosk, lobby screen, preview page, or public display depends on unauthenticated access

These future fixes are recorded here for continuity only.

They are not part of the current execution.

---

# Final Instruction

Begin now with Fix 4 only.

Inspect first.

Reason deeply.

Prefer the smallest correct change.

Preserve existing behavior.

Report honestly.

Stop after implementation and review.
