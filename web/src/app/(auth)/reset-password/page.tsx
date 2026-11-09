"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { PasswordInput } from "@/components/common/password-input";
import { newPassword } from "@/lib/validation";
import { useHydrated } from "@/lib/use-hydrated";

const schema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This reset link is incomplete. <Link href="/forgot-password" className="font-medium underline">Request a new one</Link>.
        </AlertDescription>
      </Alert>
    );
  }

  const onSubmit = async (v: Values) => {
    setError(null);
    const res = await fetch("/api/proxy/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: v.password }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) return setError(body?.error?.message ?? "Could not reset the password. Try again.");
    setDone(true);
  };

  if (done) {
    return (
      <div role="status" className="space-y-3">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="text-sm text-muted-foreground">You&apos;ve been signed out everywhere. Sign in with your new password.</p>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-2 h-10 w-full" })}>Go to sign in</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted-foreground">At least 8 characters, with letters and numbers.</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate method="post" className="space-y-5">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Field label="New password" error={errors.password?.message} required>
          {(a) => <PasswordInput {...a} {...register("password")} autoComplete="new-password" />}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message} required>
          {(a) => <PasswordInput {...a} {...register("confirm")} autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={!hydrated} loading={isSubmitting} loadingText="Updating…">
          Update password
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
