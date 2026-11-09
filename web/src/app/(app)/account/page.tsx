"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PhotoUpload } from "@/components/common/files";
import { MyConnections } from "@/components/profile/my-connections";
import { useSession } from "@/components/session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/common/password-input";
import { ApiError, api } from "@/lib/api/client";
import { formatDateTime, initials, roleLabel } from "@/lib/format";
import { newPassword } from "@/lib/validation";

const schema = z
  .object({ current_password: z.string().min(1, "Enter your current password"), new_password: newPassword, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
  .refine((v) => v.new_password !== v.current_password, { path: ["new_password"], message: "Choose a different password" });
type Values = z.infer<typeof schema>;

function ChangePassword() {
  const router = useRouter();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });
  const save = useMutation({
    mutationFn: (v: Values) => api("/auth/change-password", { method: "POST", body: { current_password: v.current_password, new_password: v.new_password } }),
    onSuccess: () => {
      reset();
      toast.success("Password changed", { description: "Other devices have been signed out." });
      router.replace("/account");
      router.refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "WRONG_PASSWORD") setError("current_password", { message: e.message });
      else if (e instanceof ApiError && e.code === "PASSWORD_REUSED") setError("new_password", { message: e.message });
      else toast.error(e instanceof ApiError ? e.message : "Could not change the password");
    },
  });
  return (
    <Card>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>At least 8 characters, with letters and numbers. Other devices will be signed out.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-sm">
          <Field label="Current password" error={errors.current_password?.message} required>
            {(a) => <PasswordInput {...a} {...register("current_password")} autoComplete="current-password" />}
          </Field>
          <Field label="New password" error={errors.new_password?.message} required>
            {(a) => <PasswordInput {...a} {...register("new_password")} autoComplete="new-password" />}
          </Field>
          <Field label="Confirm new password" error={errors.confirm?.message} required>
            {(a) => <PasswordInput {...a} {...register("confirm")} autoComplete="new-password" />}
          </Field>
        </CardContent>
        <CardFooter className="border-t">
          <Button type="submit" loading={save.isPending} loadingText="Updating…">
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function AccountPage() {
  const me = useSession();
  const router = useRouter();
  const required = useSearchParams().get("required") === "1" || me.must_change_password;
  return (
    <>
      <PageHeader title="My account" description="Your profile, everything connected to you, and sign-in security." />
      {required && (
        <Alert className="mb-6 border-warning/40 bg-warning/5">
          <ShieldAlert className="text-warning" aria-hidden />
          <AlertTitle>Set your own password to continue</AlertTitle>
          <AlertDescription>You signed in with a temporary password. Choose a new one before using Vidyanexa.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardContent className="flex flex-col items-center pt-2 text-center">
            <PhotoUpload
              fileId={me.photo_file_id}
              purpose="user_photo"
              ownerId={me.id}
              canEdit
              onChanged={() => router.refresh()}
              className="size-20 rounded-full bg-primary/10 text-2xl font-semibold text-primary"
              fallback={initials(me.full_name)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Click your photo to change it</p>
            <h2 className="mt-4 text-lg font-semibold">{me.full_name}</h2>
            <p className="text-sm text-muted-foreground">{me.email}</p>
            <dl className="mt-6 w-full divide-y text-left text-sm">
              {[
                ["Role", roleLabel(me.role)],
                ["School", me.school?.name ?? "Platform"],
                ["Phone", me.phone ?? "—"],
                ["Last sign-in", formatDateTime(me.last_login_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <ChangePassword />
      </div>
      {me.school && <MyConnections />}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
