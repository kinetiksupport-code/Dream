import type { User } from "@supabase/supabase-js";

/** Name and email of the signed-in Google account; the profile only fills gaps. */
export function accountIdentity(
  user: Pick<User, "email" | "user_metadata"> | null | undefined,
  profile: { email?: string; display_name?: string | null } | null,
) {
  const meta = user?.user_metadata ?? {};
  const fromGoogle = [meta.full_name, meta.name].find(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  return {
    name: profile?.display_name?.trim() || fromGoogle?.trim() || "",
    email: user?.email || profile?.email || "",
  };
}
