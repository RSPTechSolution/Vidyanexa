import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GlowBackdrop, Section } from "@/components/marketing/section";
import { FEATURES } from "@/content/features";
import { JsonLd, breadcrumbs, graph, pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "School ERP Features: Attendance, Fees, Exams & More",
  description:
    "Every module of the Vidyanexa school ERP: attendance, fees, exams and report cards, bus tracking, HR and payroll, parent app, admissions and library.",
  path: "/features",
  keywords: ["school ERP features", "school management system modules", "school software India", "school management software features"],
});

export default function FeaturesPage() {
  return (
    <>
      <JsonLd data={graph(
        breadcrumbs([{ name: "Features", path: "/features" }]),
        {
          "@type": "ItemList",
          name: "Vidyanexa features",
          itemListElement: FEATURES.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.name, url: `${SITE_URL}/features/${f.slug}` })),
        },
      )} />
      <section className="relative isolate overflow-hidden px-5 pt-16 pb-12 sm:px-8 lg:pt-24">
        <GlowBackdrop />
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-primary">Features</p>
          <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">School ERP features for every office in your school</h1>
          <p className="mt-5 text-lg text-pretty text-muted-foreground">
            Vidyanexa brings admissions, attendance, fees, exams, transport, HR, library and campus security into one school management system,
            with apps for parents, staff and drivers. Switch on only the modules you need.
          </p>
        </div>
      </section>
      <Section className="pt-4 lg:pt-4">
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.slug}>
              <Link href={`/features/${f.slug}`} className="group flex h-full flex-col rounded-2xl border bg-card p-6 shadow-xs transition hover:border-primary/40 hover:shadow-md">
                <h2 className="font-heading text-lg font-bold">{f.name}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{f.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Learn about {f.name.toLowerCase()} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-center text-muted-foreground">
          Also included: timetables, syllabus tracking, live classes, inventory and assets, analytics and an AI assistant.{" "}
          <Link href="/pricing" className="font-semibold text-primary hover:underline">See plans and pricing</Link>.
        </p>
      </Section>
    </>
  );
}
