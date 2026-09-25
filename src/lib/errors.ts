// Readable message for anything thrown. Supabase errors are plain objects
// with a message field rather than Error instances, so `instanceof Error`
// alone turns them into "[object Object]".
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return String(err);
}
