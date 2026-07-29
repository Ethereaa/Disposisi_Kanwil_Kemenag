// Extracts a human-readable detail from any thrown value (Supabase
// PostgrestError/AuthError, a native Error, or a raw string) and appends
// it to a fallback Indonesian message, so toasts show the *real* reason
// an operation failed instead of a generic "Gagal ..." with no detail.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; error_description?: unknown };
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) {
      return `${fallback} (${anyErr.message})`;
    }
    if (typeof anyErr.error_description === 'string' && anyErr.error_description.trim()) {
      return `${fallback} (${anyErr.error_description})`;
    }
  }
  if (typeof err === 'string' && err.trim()) {
    return `${fallback} (${err})`;
  }
  return fallback;
}
