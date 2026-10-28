"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/common/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, authRequest } from "@/lib/api/client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/** Sign in with a 6-digit code sent by email, or by SMS when a mobile number is entered. */
export function CodeLoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const byPhone = identifier.trim() !== "" && !identifier.includes("@");

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      await authRequest("/api/auth/login-code/request", { identifier: identifier.trim() });
      setSent(true);
      setWait(60);
      setInfo(byPhone ? "If that number belongs to an account, a code is on its way by SMS and email." : "If that email belongs to an account, a code is on its way.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      await authRequest("/api/auth/login-code", { identifier: identifier.trim(), code: code.trim() });
      setRedirecting(true);
      window.location.assign(safeNext(new URLSearchParams(window.location.search).get("next")));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (sent) verify(); else send(); }}>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {info && !error && <p role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-sm">{info}</p>}
      <Field label="Email or mobile number" required>
        {(a) => <Input {...a} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" disabled={sent} placeholder="name@example.com or 98140 12345" />}
      </Field>
      {sent && (
        <Field label="Sign-in code" required>
          {(a) => <Input {...a} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" className="font-mono tracking-[0.4em]" autoFocus />}
        </Field>
      )}
      {sent ? (
        <>
          <Button type="submit" size="lg" className="h-10 w-full" disabled={code.length !== 6} loading={busy || redirecting} loadingText={redirecting ? "Opening your dashboard…" : "Checking…"}>Sign in</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setSent(false); setCode(""); setInfo(null); }}>Change details</button>
            <button type="button" className="font-medium text-primary enabled:hover:underline disabled:text-muted-foreground" disabled={wait > 0 || busy} onClick={send}>
              {wait > 0 ? `Send again in ${wait}s` : "Send again"}
            </button>
          </div>
        </>
      ) : (
        <Button type="submit" size="lg" className="h-10 w-full" disabled={identifier.trim().length < 3} loading={busy} loadingText="Sending…">Send me a code</Button>
      )}
    </form>
  );
}
