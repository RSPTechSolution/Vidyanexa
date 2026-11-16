import { cn } from "@/lib/utils";

/* The Vidyanexa crest and wordmark. Source artwork and rules: brand/ at the repository root. */

type Tone = "auto" | "light" | "dark";

/**
 * The crest. `tone` is the surface it sits on: "light" uses the navy crest, "dark" the ivory one,
 * "auto" follows the colour theme. Below 48 px the simplified crest (no inner border) stays crisp.
 */
export function BrandMark({ className, size = 36, tone = "auto" }: { className?: string; size?: number; tone?: Tone }) {
  const dark = size < 48 ? "/brand/crest-small.svg" : "/brand/crest.svg";
  const box = { width: size, height: Math.round(size * 1.12) };
  /* eslint-disable @next/next/no-img-element -- static vector artwork, nothing to optimise */
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)} style={box}>
      {tone !== "dark" && <img src={dark} alt="" width={box.width} height={box.height} className={cn("h-full w-auto", tone === "auto" && "dark:hidden")} />}
      {tone !== "light" && <img src="/brand/crest-reverse.svg" alt="" width={box.width} height={box.height} className={cn("h-full w-auto", tone === "auto" && "hidden dark:block")} />}
    </span>
  );
  /* eslint-enable @next/next/no-img-element */
}

/** The name in widely spaced capitals in the app font (theme 4). One word, one colour (never set "NEXA" apart). */
export function Wordmark({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="font-brand text-[0.95rem] font-extrabold tracking-[0.13em] [font-feature-settings:normal]">VIDYANEXA</span>
      {tagline && <span className="mt-1.5 font-brand text-[10px] font-bold tracking-[0.22em] text-brand-gold [font-feature-settings:normal]">SCHOOL MANAGEMENT</span>}
    </span>
  );
}

/** The full horizontal logo (crest + name), for light or dark surfaces. */
export function FullLogo({ className, tone = "auto" }: { className?: string; tone?: Tone }) {
  /* eslint-disable @next/next/no-img-element -- static vector artwork */
  return (
    <span className={cn("block w-48", className)}>
      {tone !== "dark" && <img src="/brand/logo.svg" alt="Vidyanexa" className={cn("h-auto w-full", tone === "auto" && "dark:hidden")} />}
      {tone !== "light" && <img src="/brand/logo-reverse.svg" alt="Vidyanexa" className={cn("h-auto w-full", tone === "auto" && "hidden dark:block")} />}
    </span>
  );
  /* eslint-enable @next/next/no-img-element */
}
