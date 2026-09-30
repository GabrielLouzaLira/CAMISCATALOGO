import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeBindings } from "@/db/runtime";
import { readAdminSession, secretsMatch } from "./admin-session";

export const ADMIN_SESSION_COOKIE = "camisa10_admin_session";

export type AdminUser = {
  displayName: string;
  email: string;
};

type AdminCredentials = {
  email: string;
  password: string;
  sessionSecret: string;
};

function configuredValue(name: keyof ReturnType<typeof getRuntimeBindings>): string {
  const value = getRuntimeBindings()[name] ?? process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function getAdminCredentials(): AdminCredentials | null {
  const email = configuredValue("ADMIN_LOGIN").toLowerCase();
  const password = configuredValue("ADMIN_PASSWORD");
  const sessionSecret = configuredValue("ADMIN_SESSION_SECRET");
  if (!email || !password || sessionSecret.length < 32) return null;
  return { email, password, sessionSecret };
}

export async function credentialsAreValid(email: string, password: string): Promise<boolean> {
  const credentials = getAdminCredentials();
  if (!credentials) return false;
  const [emailMatches, passwordMatches] = await Promise.all([
    secretsMatch(email.trim().toLowerCase(), credentials.email),
    secretsMatch(password, credentials.password),
  ]);
  return emailMatches && passwordMatches;
}

async function sessionFromToken(token: string | undefined): Promise<AdminUser | null> {
  const credentials = getAdminCredentials();
  if (!credentials) return null;
  const session = await readAdminSession(token, credentials.sessionSecret);
  if (!session || session.email !== credentials.email) return null;
  return { email: credentials.email, displayName: credentials.email };
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const cookieStore = await cookies();
  return sessionFromToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdminPage(): Promise<{ authorized: true; user: AdminUser }> {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return { authorized: true, user };
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === new URL(request.url).origin && (!fetchSite || fetchSite === "same-origin");
}

export async function requireAdminApi(request?: Request): Promise<
  { user: AdminUser; error?: never } | { user?: never; error: Response }
> {
  // O helper `cookies()` do framework lê a sessão corretamente tanto nas
  // páginas quanto nas rotas de API no ambiente publicado. A leitura manual
  // do cabeçalho podia perder o cookie em requisições internas do painel.
  const user = await getAdminUser();
  if (!user) {
    return { error: Response.json({ error: "Autenticação necessária." }, { status: 401 }) };
  }
  if (request && request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return {
      error: Response.json(
        { error: "Origem da requisição administrativa inválida." },
        { status: 403 },
      ),
    };
  }
  return { user };
}
