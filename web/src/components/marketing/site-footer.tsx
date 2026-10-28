import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/brand/logo";

const COLUMNS = [
  { title: "Product", links: [["All features", "/features"], ["Pricing", "/pricing"], ["Custom plan", "/pricing#custom"], ["Start free trial", "/signup"]] },
  { title: "Solutions", links: [["Attendance", "/features/attendance-management-system"], ["Fee management", "/features/school-fee-management-software"], ["Exams & report cards", "/features/online-exam-report-card-software"], ["Bus tracking", "/features/school-bus-gps-tracking"], ["HR & payroll", "/features/school-hr-payroll-software"], ["Parent app", "/features/parent-teacher-communication-app"]] },
  { title: "Company", links: [["About", "/about"], ["Contact", "/contact"], ["Sign in", "/login"]] },
  { title: "Legal", links: [["Privacy policy", "/privacy"], ["Terms of service", "/terms"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Vidyanexa home">
            <BrandMark size={32} />
            <Wordmark />
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            The intelligent education management platform for schools across India.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:px-8">
          <p>© {new Date().getFullYear()} Vidyanexa. All rights reserved.</p>
          <p>Prices in INR.</p>
        </div>
      </div>
    </footer>
  );
}
