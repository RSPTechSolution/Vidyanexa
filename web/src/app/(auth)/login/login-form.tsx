"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { VerifyCode } from "@/components/auth/verify-code";
import { Field } from "@/components/common/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, authRequest } from "@/lib/api/client";
import { useHydrated } from "@/lib/use-hydrated";

// People sign in with their email alone: an email has one active account across Vidyanexa.
const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const [showPassword, setShowPassword] = useState(false);
  // Stays true after a successful sign-in until the browser has loaded the next page.
  const [redirecting, setRedirecting] = useState(false);
  // A school that signed itself up but hasn't confirmed its email yet: finish that here.
  const [confirm, setConfirm] = useState<{ email: string; slug: string } | null>(null);
  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await authRequest("/api/auth/login", v);
      // Full navigation so server components render with the new session cookie.
      setRedirecting(true);
      window.location.assign(safeNext(new URLSearchParams(window.location.search).get("next")));
    } catch (e) {
      if (e instanceof ApiError && e.code === "ACCOUNT_NOT_VERIFIED") {
        const d = (e.details ?? {}) as { email?: string; school_slug?: string };
        return setConfirm({ email: d.email ?? v.email, slug: d.school_slug ?? "" });
      }
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.");
    }
  };

  if (confirm) return <VerifyCode email={confirm.email} schoolSlug={confirm.slug} sendOnOpen onBack={() => setConfirm(null)} />;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate method="post" className="space-y-5">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field label="Email" error={errors.email?.message} required>
        {(a) => <Input {...a} {...register("email")} type="email" autoComplete="username" inputMode="email" />}
      </Field>
      <Field label="Password" error={errors.password?.message} required>
        {(a) => (
          <div className="relative">
            <Input {...a} {...register("password")} type={showPassword ? "text" : "password"} autoComplete="current-password" className="pr-10" />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link>
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-10 w-full"
        disabled={!hydrated}
        loading={isSubmitting || redirecting}
        loadingText={redirecting ? "Opening your dashboard…" : "Signing in…"}
      >
        Sign in
      </Button>
    </form>
  );
}
