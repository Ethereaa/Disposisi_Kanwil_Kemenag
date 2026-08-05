/*
# Restrict profiles.role changes to admins

## Problem
`profiles` has row-scoped policies that let a user modify their OWN row
(see 20260728124412_create_profiles_table.sql):

  update_own_profile : UPDATE ... USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
  insert_own_profile : INSERT ... WITH CHECK (auth.uid() = id)
  delete_own_profile : DELETE ... USING (auth.uid() = id)

None of them restrict WHICH columns may be written. Once
20260730150000_add_role_and_restrict_delete.sql added `role` and made the
DELETE policies on surat_masuk / surat_keluar / agenda_pimpinan depend on
`profiles.role = 'admin'`, those policies became self-service: a 'staf'
user can simply write role = 'admin' onto their own profile row with the
anon key that ships in the browser bundle, and then satisfies every
admin-only DELETE policy.

There are two ways in, so guarding UPDATE alone is not enough:
  1. UPDATE profiles SET role = 'admin' WHERE id = auth.uid()
  2. DELETE own row (delete_own_profile), then INSERT a fresh one with
     role = 'admin' (insert_own_profile) — same result, different verb.

## Fix
A single BEFORE INSERT OR UPDATE trigger on `profiles` that rejects any
statement which sets `role` to a value the caller is not entitled to set.
Both entry points above route through it.

Deliberately a trigger rather than rewritten policies: RLS in Postgres is
row-scoped, not column-scoped, so expressing "may update this row but not
this column" in a policy is not directly possible. A trigger states the
rule once, in one place, and applies to every present and future write
path (client, bulk import, manual SQL) without any of them having to
remember it.

## Who may still change role
- An existing admin (checked against profiles.role, not a client claim).
- Any caller with no JWT — i.e. auth.uid() IS NULL. That covers the
  service_role key, the Supabase SQL editor, and migrations themselves,
  so the documented promotion workflow from
  20260730150000_add_role_and_restrict_delete.sql still works:
      update profiles set role = 'admin' where username = '<username>';
  The `anon` role also has auth.uid() = NULL, but anon holds no INSERT or
  UPDATE policy on profiles at all, so RLS rejects it before this trigger
  is ever reached.

## Security
- SECURITY DEFINER so the admin lookup does not depend on the caller's
  own SELECT policy on `profiles`. If that policy is ever tightened, this
  check keeps working instead of silently failing open.
- `SET search_path = public` — standard hardening for SECURITY DEFINER.
- No recursion: the function only SELECTs from profiles, and SELECT does
  not fire INSERT/UPDATE triggers.

## Notes
1. Non-role updates are untouched. updateUsername() in src/lib/storage.ts
   sends only { username }, so NEW.role equals OLD.role and the trigger
   returns immediately.
2. New signups are unaffected: handle_new_user() never sets `role`, so the
   column default ('staf') applies and NEW.role = 'staf' is permitted.
3. This migration does not change anyone's existing role.
*/

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  old_role text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.role ELSE 'staf' END;
BEGIN
  -- No change to `role` — nothing to authorize.
  IF NEW.role IS NOT DISTINCT FROM old_role THEN
    RETURN NEW;
  END IF;

  -- No JWT: service_role, SQL editor, or a migration. Trusted context.
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = caller AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang dapat mengubah role pengguna.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Plain BEFORE INSERT OR UPDATE, not UPDATE OF role: `UPDATE OF` fires
-- only when the column appears in the SET list, and this is a security
-- boundary that should not depend on how the statement was written.
DROP TRIGGER IF EXISTS trg_enforce_profile_role_change ON public.profiles;
CREATE TRIGGER trg_enforce_profile_role_change
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_change();
