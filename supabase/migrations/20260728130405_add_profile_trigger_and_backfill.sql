/*
# Add auto-profile trigger + backfill existing users

## Summary
1. Creates a `handle_new_user` trigger function that automatically inserts a
   row into `profiles` whenever a new user signs up in `auth.users`. The
   username is taken from `raw_user_meta_data->>username` (set by the
   frontend during signUp). If no username is provided, the local-part of
   the email is used as a fallback.
2. Attaches the trigger to `auth.users` AFTER INSERT.
3. Backfills the existing user (who registered before the profiles table
   existed) by inserting a profile row with a default username derived from
   the email.

## Security
- The trigger function runs with SECURITY DEFINER (elevated privileges) so
  it can insert into `profiles` even though the anon role normally cannot.
  This is the standard Supabase pattern for auto-creating profile rows.
- The function is owned by the postgres user and only fires on auth.users
  INSERT — it cannot be called directly by clients.
- RLS remains ENABLED on profiles; the trigger bypasses RLS because it runs
  as SECURITY DEFINER (the table owner), which is the intended behavior.

## Notes
1. The trigger is idempotent: it checks `IF NOT EXISTS` before inserting,
   so re-running the migration or a duplicate trigger fire won't create
   duplicate profile rows.
2. The username uniqueness constraint still applies — the trigger's
   fallback username (email local-part) may collide if two users share the
   same email prefix. The frontend validates username uniqueness before
   signUp, so this is a safety net only.
*/

-- Trigger function: auto-create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  SELECT
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'username', ''),
      split_part(NEW.email, '@', 1)
    ),
    NEW.email
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = NEW.id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and re-create the trigger to make this idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: create profile for the existing user who registered before the
-- profiles table existed. Uses email local-part as a default username.
INSERT INTO public.profiles (id, username, email)
SELECT
  id,
  split_part(email, '@', 1),
  email
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE profiles.id = auth.users.id
)
ON CONFLICT (id) DO NOTHING;
