"use client";

import { useState } from "react";
import { CodeLoginForm } from "./code-login-form";
import { LoginForm } from "./login-form";

/** Password sign-in, with a switch to a one-time code sent by email or SMS. */
export function SignIn() {
  const [mode, setMode] = useState<"password" | "code">("password");
  // What was typed in one form carries over to the other.
  const [email, setEmail] = useState("");
  return (
    <>
      {mode === "password" ? <LoginForm email={email} onEmail={setEmail} /> : <CodeLoginForm email={email} onEmail={setEmail} />}
      <div className="mt-6 border-t pt-4 text-center">
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setMode((m) => (m === "password" ? "code" : "password"))}>
          {mode === "password" ? "Use a one-time code instead" : "Use your password instead"}
        </button>
      </div>
    </>
  );
}
