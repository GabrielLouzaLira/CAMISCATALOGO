export type AdminAuthorization =
  | "authorized"
  | "identity_missing"
  | "allowlist_unset"
  | "not_allowed";

export function parseAdminAllowlist(configured: string | null | undefined) {
  return new Set(
    (configured ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function adminAuthorization(
  email: string | null | undefined,
  configured: string | null | undefined,
): AdminAuthorization {
  if (!email) return "identity_missing";
  const allowlist = parseAdminAllowlist(configured);
  if (!allowlist.size) return "allowlist_unset";
  return allowlist.has(email.trim().toLowerCase())
    ? "authorized"
    : "not_allowed";
}
