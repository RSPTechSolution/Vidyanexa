"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/lib/use-hydrated";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (v: Values) => {
    setError(null);
    const res = await fetch("/api/proxy/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    }).catch(() => null);
    if (!res) return setError("Could not reach the server. Try again.");
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return setError(body?.error?.message ?? "Request failed. Try again.");
    }
    setSent(true);
  };

  return (
    <>
      <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />Back to sign in
      </Link>
      {sent ? (
        <div role="status" className="space-y-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-success/10 text-success">
            <MailCheck className="size-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            If an account matches those details, we&apos;ve sent a link to reset the password. The link expires in 30 minutes.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-1.5 mb-8 text-sm text-muted-foreground">Enter the email you sign in with and we&apos;ll send you a reset link.</p>
          <form onSubmit={handleSubmit(onSubmit)} noValidate method="post" className="space-y-5">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Field label="Email" error={errors.email?.message} required>
              {(a) => <Input {...a} {...register("email")} type="email" autoComplete="email" />}
            </Field>
            <Button type="submit" size="lg" className="h-10 w-full" disabled={!hydrated} loading={isSubmitting} loadingText="Sending…">
              Send reset link
            </Button>
          </form>
        </>
      )}
    </>
  );
}
