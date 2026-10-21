"use client";

import { MailCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Field } from "@/components/common/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, authRequest } from "@/lib/api/client";

/**
 * Confirms a new school's email: the 6-digit code sent by email (and SMS when a mobile was given). The code also signs
 * the person in, so the school opens straight away. Used after sign-up, and on the sign-in page when someone who
 * hasn't confirmed yet tries their password.
 */
export function VerifyCode({ email, schoolSlug, bySms = false, sendOnOpen = false, onBack }: {
  email: string; schoolSlug: string; bySms?: boolean;
  /** Send a fresh code as soon as this shows (the earlier one may have expired). */
  sendOnOpen?: boolean;
  onBack?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(sendOnOpen ? 0 : 60);
  const tried = useRef("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = useCallback(async () => {
    setError(null);
    try {
      await authRequest("/api/auth/login-code/request", { identifier: email, school_slug: schoolSlug });
      setInfo(`A new code is on its way to ${email}${bySms ? " and your mobile" : ""}.`);
      setWait(60);
      setCode("");
      tried.current = "";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.");
    }
  }, [email, schoolSlug, bySms]);

  const opened = useRef(false);
  useEffect(() => {
    if (sendOnOpen && !opened.current) {
      opened.current = true;
      void resend();
    }
  }, [sendOnOpen, resend]);

  const verify = useCallback(async (value: string) => {
    if (value.length !== 6 || busy) return;
    tried.current = value;
    setError(null);
    setBusy(true);
    try {
      await authRequest("/api/auth/login-code", { identifier: email, school_slug: schoolSlug, code: value });
      try {
        localStorage.setItem("eduvia.lastSchool", schoolSlug);
      } catch {
        /* storage unavailable */
      }
      setOpening(true);
      window.location.assign("/dashboard?welcome=1");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }, [email, schoolSlug, busy]);

  // All six digits in (typed, pasted, or filled in by the phone from the SMS): check straight away, once per code.
  useEffect(() => {
    if (code.length === 6 && code !== tried.current) void verify(code);
  }, [code, verify]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary-container-foreground">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Confirm your email</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
            {bySms ? " and by SMS to your mobile" : ""}. Enter it to open your school. It expires in 10 minutes.
          </p>
        </div>
      </div>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {info && !error && <p role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-sm">{info}</p>}
      <form noValidate onSubmit={(e) => { e.preventDefault(); tried.current = ""; void verify(code); }} className="space-y-4">
        <Field label="Confirmation code" required hint="Can't find it? Check your spam or promotions folder.">
          {(a) => (
            <Input {...a} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
              autoComplete="one-time-code" placeholder="6 digits" className="h-12 text-center font-mono text-xl tracking-[0.5em]" autoFocus />
          )}
        </Field>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={code.length !== 6} loading={busy || opening}
          loadingText={opening ? "Opening your school…" : "Checking…"}>
          Confirm and open my school
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {onBack ? (
          <button type="button" className="font-medium text-primary hover:underline" onClick={onBack}>Wrong email? Go back</button>
        ) : <span />}
        <button type="button" className="font-medium text-primary enabled:hover:underline disabled:text-muted-foreground" disabled={wait > 0 || busy} onClick={resend}>
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </div>
    </div>
  );
}
