import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SignIn } from "./sign-in";

export const metadata: Metadata = pageMetadata({
  title: "Sign In",
  description: "Sign in to Vidyanexa with your email and password, or with a one-time code. For principals, teachers, office staff, parents and students.",
  path: "/login",
  keywords: ["Vidyanexa login", "school ERP login", "parent login"],
});

export default function LoginPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your school&apos;s Vidyanexa workspace.</p>
      </div>
      <SignIn />
    </>
  );
}
