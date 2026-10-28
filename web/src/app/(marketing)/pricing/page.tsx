import type { Metadata } from "next";
import { JsonLd, breadcrumbs, faqPage, graph, pageMetadata } from "@/lib/seo";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { Faq, GlowBackdrop, PRICING_FAQ, Section, SectionHeading } from "@/components/marketing/section";
import { getPlans, getPricing } from "@/lib/api/public";
import { PricingView } from "./pricing-view";

export const metadata: Metadata = pageMetadata({
  title: "School Management Software Pricing in India (INR)",
  description: "Vidyanexa school ERP plans in rupees: Basic ₹2,999, Pro ₹7,999 and Max ₹17,999 a month, or a custom plan with only the modules you need. 14-day free trial.",
  path: "/pricing",
  keywords: ["school management software price", "school ERP pricing India", "school software cost", "school ERP plans", "affordable school management software"],
});

export default async function PricingPage() {
  const [plans, catalog] = await Promise.all([getPlans(), getPricing()]);
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "Pricing", path: "/pricing" }]), faqPage(PRICING_FAQ))} />
      <section className="relative isolate overflow-hidden px-5 pt-16 pb-24 sm:px-8 lg:pt-24">
        <GlowBackdrop />
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium text-primary">Pricing</p>
            <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">School management software pricing: plans that grow with your school</h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Every plan includes the parent, staff and driver apps, daily backups and a {catalog.trial_days}-day free trial. Prices in INR.
            </p>
          </div>
          <PricingView plans={plans} catalog={catalog} />
        </div>
      </section>

      <Section className="bg-muted/30">
        <SectionHeading eyebrow="Compare" title="What's in each plan" />
        <div className="mt-12">
          <ComparisonTable plans={plans} modules={catalog.modules} />
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="FAQ" title="Pricing questions" />
        <div className="mt-12"><Faq items={PRICING_FAQ} /></div>
      </Section>
    </>
  );
}
