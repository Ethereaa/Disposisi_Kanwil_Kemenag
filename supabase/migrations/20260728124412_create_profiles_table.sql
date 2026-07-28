/*
# Create profiles table for user display names

## Summary
Creates a `profiles` table that stores each user's username alongside their
Supabase Auth account. The `profiles.id` is a 1:1 foreign key to `auth.users.id`,
so every profile row corresponds to exactly one auth account. Passwords are
NEVER stored here — Supabase Auth handles all password hashing and verification.

## New Tables
1. `profiles`
   - id (uuid, primary key, references auth.users.id ON DELETE CASCADE)
   - username (text, unique, not null) — display name chosen at registration
   - email (text, not null) — denormalized from auth.users for convenience
   - created_at (timestamptz, default now())

## Security (RLS)
- Row Level Security ENABLED on `profiles`.
- SELECT: any authenticated user can read ALL profiles (family app — everyone
  sees who created/disposed each letter). This is intentionally shared.
- INSERT: a user can only insert their OWN profile row (auth.uid() = id).
- UPDATE: a user can only update their OWN profile row.
- DELETE: a user can only delete their OWN profile row.

## Notes
1. profiles.id is set to auth.uid() by default so inserts from the client
   that omit `id` still satisfy the INSERT policy's WITH CHECK.
2. username has a UNIQUE constraint so no two family members share a username.
3. The app uses this table to resolve usernames for login-by-username: it
   queries profiles by username to get the email, then calls
   signInWithPassword with that email.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated family member can see all profiles (shared app)
DROP POLICY IF EXISTS "family_select_profiles" ON profiles;
CREATE POLICY "family_select_profiles"
  ON profiles FOR SELECT
  TO authenticated USING (true);

-- Users can only insert their own profile
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
  ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- Users can only update their own profile
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Users can only delete their own profile
DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile"
  ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);
