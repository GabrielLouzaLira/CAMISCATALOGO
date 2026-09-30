import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  credentialsAreValid,
  getAdminCredentials,
} from "@/lib/admin-auth";
import { createAdminSession } from "@/lib/admin-session";

function isSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function POST(request: Request) {
  const loginUrl = new URL("/admin/login", request.url);
  if (!isSameOrigin(request)) {
    loginUrl.searchParams.set("error", "1");
    return NextResponse.redirect(loginUrl, 303);
  }
  const credentials = getAdminCredentials();
  if (!credentials) {
    loginUrl.searchParams.set("config", "1");
    return NextResponse.redirect(loginUrl, 303);
  }
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!(await credentialsAreValid(email, password))) {
    loginUrl.searchParams.set("error", "1");
    return NextResponse.redirect(loginUrl, 303);
  }
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: await createAdminSession(credentials.email, credentials.sessionSecret),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
