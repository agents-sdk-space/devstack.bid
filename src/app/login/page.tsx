import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { safeNext } from "@/lib/auth/github-policy";
import { isAuthProvider } from "@/lib/auth/oauth-flow";
import { turnstileSiteKey } from "@/lib/auth/turnstile";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to DevStack with Cursor, Google, GitHub, or a DevStack password so chat history stays on your account.",
};

const NOTICES = new Set(["missing", "error", "denied", "invalid", "taken", "weak", "captcha"]);

type LoginQuery = { next?: string | string[]; auth?: string | string[]; provider?: string | string[] };

export default function LoginPage({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  return (
    <Suspense fallback={<LoginForm next="/" auth="" provider="" />}>
      <LoginFromQuery searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginFromQuery({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  const query = await searchParams;
  const nextRaw = typeof query.next === "string" ? query.next : null;
  const authRaw = typeof query.auth === "string" ? query.auth : "";
  const providerRaw = typeof query.provider === "string" ? query.provider : "";
  return <LoginForm next={safeNext(nextRaw)} auth={NOTICES.has(authRaw) ? authRaw : ""} provider={isAuthProvider(providerRaw) ? providerRaw : ""} turnstileSiteKey={turnstileSiteKey()} />;
}
