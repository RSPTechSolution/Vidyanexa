import {
  HardDrive, Server, UsersRound, Sparkles, ChartNoAxesCombined, Cctv, DoorOpen, FileCheck2, Ticket, UserCheck, Hotel, Library, Package, BookOpen, Award, Briefcase, BriefcaseBusiness, Bus, Calculator, ClipboardPen, Handshake, MessagesSquare, Smartphone, FileQuestion, Video, CalendarHeart, CalendarOff, Fingerprint, ListChecks, QrCode, BookMarked, BookOpenCheck, FileBadge2, NotebookPen, Repeat2, TrendingUp, UserPlus, Mail, Building2, CalendarDays, ClipboardCheck, FileSpreadsheet, Megaphone, Wallet, CalendarRange, CreditCard, GraduationCap, Inbox, KeyRound, LayoutDashboard, Layers, School, ScrollText, Settings2, ToggleRight, Users, type LucideIcon,
} from "lucide-react";
import type { Me } from "@/lib/api/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the school has this module enabled. */
  module?: string;
  /** Hidden unless the user holds this permission. */
  permission?: string;
  /** Only shown to these roles. */
  roles?: string[];
  /** Show a live count next to the label. */
  badge?: "notices";
  superAdminOnly?: boolean;
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Only routes that exist are listed. Each build phase adds its module's pages here. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: ["home"] },
      { label: "AI assistant", href: "/assistant", icon: Sparkles, module: "ai", permission: "ai.use", keywords: ["ask", "chat", "question", "help", "draft notice"] },
      { label: "Analytics", href: "/analytics", icon: ChartNoAxesCombined, module: "analytics", permission: "analytics.view", keywords: ["reports", "insights", "at risk", "trends", "performance"] },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Schools", href: "/platform/schools", icon: Building2, superAdminOnly: true, keywords: ["tenants", "provision"] },
      { label: "Plans", href: "/platform/plans", icon: Layers, superAdminOnly: true, keywords: ["pricing", "subscription"] },
      { label: "System", href: "/platform/system", icon: Server, superAdminOnly: true, keywords: ["health", "backup", "restore", "banner", "maintenance", "status"] },
      { label: "Leads", href: "/platform/leads", icon: Inbox, superAdminOnly: true, keywords: ["enquiries", "contact", "upgrade requests"] },
    ],
  },
  {
    label: "Academics",
    items: [
      { label: "Students", href: "/students", icon: GraduationCap, module: "students", permission: "students.view", keywords: ["admission", "pupils", "children"] },
      { label: "Admissions", href: "/admissions", icon: UserPlus, module: "students", permission: "admissions.manage", keywords: ["enquiry", "enquiries", "leads", "new admission", "walk-in"] },
      { label: "Certificates & ID cards", href: "/certificates", icon: FileBadge2, module: "students", permission: "certificates.manage", keywords: ["tc", "transfer certificate", "bonafide", "character", "id card"] },
      { label: "Promotion", href: "/promotion", icon: TrendingUp, module: "students", permission: "students.promote", keywords: ["next class", "new session", "year end", "graduate", "alumni"] },
      { label: "Classes & sections", href: "/academics/classes", icon: School, module: "students", permission: "students.view", keywords: ["grades", "sections", "class teacher"] },
      { label: "Timetable", href: "/timetable", icon: CalendarRange, module: "academics", permission: "timetable.view", keywords: ["schedule", "periods", "free teacher", "substitute"] },
      { label: "My class", href: "/my-class", icon: UsersRound, module: "attendance", permission: "attendance.mark", roles: ["teacher"], keywords: ["class teacher", "incharge", "my students", "fee reminder"] },
      { label: "Attendance", href: "/attendance", icon: ClipboardCheck, module: "attendance", permission: "attendance.view", keywords: ["absent", "present", "roll call", "register"] },
      { label: "Scan ID cards", href: "/attendance/scan", icon: QrCode, module: "attendance", permission: "attendance.scan", keywords: ["qr", "gate", "check in", "barcode"] },
      { label: "Period attendance", href: "/attendance/periods", icon: ListChecks, module: "attendance", permission: "attendance.mark", keywords: ["bunk", "subject attendance", "period-wise"] },
      { label: "Leave requests", href: "/leave", icon: CalendarOff, module: "attendance", permission: "leave.approve", keywords: ["leave", "absence", "application"] },
      { label: "Leave", href: "/leave", icon: CalendarOff, module: "attendance", roles: ["parent", "student"], keywords: ["leave", "absent", "sick"] },
      { label: "Attendance", href: "/my-attendance", icon: ClipboardCheck, module: "attendance", roles: ["parent", "student"], keywords: ["absent", "present"] },
      { label: "Fees", href: "/my-fees", icon: Wallet, module: "fees", roles: ["parent", "student"], keywords: ["pay", "dues", "receipt", "invoice"] },
      { label: "Exams", href: "/exams", icon: FileSpreadsheet, module: "exams", permission: "exams.view", keywords: ["marks", "results", "report card", "date sheet"] },
      { label: "Syllabus", href: "/syllabus", icon: BookMarked, module: "academics", permission: "syllabus.manage", keywords: ["chapters", "curriculum", "coverage", "topics"] },
      { label: "Lesson plans", href: "/lesson-plans", icon: NotebookPen, module: "academics", permission: "syllabus.manage", keywords: ["planner", "teaching plan"] },
      { label: "Syllabus", href: "/my-syllabus", icon: BookMarked, module: "academics", roles: ["parent", "student"], keywords: ["chapters", "progress"] },
      { label: "Substitutions", href: "/substitutions", icon: Repeat2, module: "academics", permission: "substitutions.manage", keywords: ["cover", "absent teacher", "proxy", "arrangement"] },
      { label: "Online tests", href: "/online-tests", icon: FileQuestion, module: "exams", permission: "tests.manage", keywords: ["quiz", "mcq", "question bank", "cbt"] },
      { label: "Online tests", href: "/my-tests", icon: FileQuestion, module: "exams", roles: ["parent", "student"], keywords: ["quiz", "test"] },
      { label: "Live classes", href: "/live-classes", icon: Video, module: "academics", keywords: ["online class", "zoom", "meet", "jitsi"] },
      { label: "Homework", href: "/homework", icon: BookOpenCheck, module: "academics", permission: "homework.manage", keywords: ["assignment", "classwork"] },
      { label: "Homework", href: "/my-homework", icon: BookOpenCheck, module: "academics", roles: ["parent", "student"], keywords: ["assignment"] },
      { label: "Results", href: "/my-results", icon: Award, module: "exams", roles: ["parent", "student"], keywords: ["report card", "marks", "exam"] },
      { label: "My timetable", href: "/my-timetable", icon: CalendarDays, module: "academics", roles: ["teacher", "principal", "parent", "student"], keywords: ["schedule", "today", "classes"] },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Messages", href: "/messages", icon: MessagesSquare, module: "communication", keywords: ["chat", "message teacher", "parent message", "inbox"] },
      { label: "Parent-teacher meetings", href: "/ptm", icon: Handshake, module: "communication", keywords: ["ptm", "meeting", "book slot", "appointment"] },
      { label: "Surveys", href: "/surveys", icon: ClipboardPen, module: "communication", keywords: ["feedback", "poll", "questionnaire"] },
      { label: "Calendar", href: "/calendar", icon: CalendarHeart, keywords: ["holidays", "events", "vacation", "ptm", "academic calendar"] },
      { label: "Notices", href: "/notices", icon: Megaphone, module: "communication", badge: "notices", keywords: ["announcements", "circular", "news"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Fees", href: "/fees", icon: Wallet, module: "fees", permission: "fees.view", keywords: ["collect", "dues", "invoice", "receipt", "payment", "concession"] },
      { label: "Accounts", href: "/accounts", icon: Calculator, module: "accounts", permission: "accounts.view", keywords: ["expenses", "income", "ledger", "day book", "tally", "profit"] },
    ],
  },
  {
    label: "People",
    items: [
      { label: "HR and payroll", href: "/hr", icon: Briefcase, module: "hr", permission: "hr.view", keywords: ["staff", "salary", "payslip", "payroll", "staff attendance", "leave"] },
      { label: "My leave and pay", href: "/my-hr", icon: BriefcaseBusiness, module: "hr", roles: ["school_admin", "principal", "teacher", "accountant", "receptionist", "librarian", "hr_manager", "transport_manager", "security_guard", "staff", "driver"], keywords: ["payslip", "salary", "apply leave", "leave balance"] },
    ],
  },
  {
    label: "Campus",
    items: [
      { label: "Library", href: "/library", icon: Library, module: "library", permission: "library.view", keywords: ["books", "issue", "return", "fine", "accession", "catalogue"] },
      { label: "Library books", href: "/my-library", icon: BookOpen, module: "library", keywords: ["borrowed", "due", "books"] },
      { label: "Hostel", href: "/hostel", icon: Hotel, module: "hostel", permission: "hostel.view", keywords: ["rooms", "beds", "boarding", "warden"] },
      { label: "Hostel", href: "/my-hostel", icon: Hotel, module: "hostel", roles: ["parent", "student"], keywords: ["room", "warden"] },
      { label: "Inventory and assets", href: "/inventory", icon: Package, module: "inventory", permission: "inventory.view", keywords: ["stock", "store", "assets", "equipment", "register"] },
    ],
  },
  {
    label: "Safety",
    items: [
      { label: "Gate and security", href: "/gate", icon: DoorOpen, module: "security", permission: "gate.view", keywords: ["visitor", "guard", "gate", "workers", "contractor", "check in"] },
      { label: "Gate passes", href: "/gate-pass", icon: Ticket, module: "security", roles: ["parent", "student", "teacher", "principal", "school_admin", "receptionist"], keywords: ["early pickup", "leave early", "collect child", "out pass"] },
      { label: "My visitors", href: "/my-visitors", icon: UserCheck, module: "security", permission: "visitors.invite", keywords: ["guest", "expected", "visitor"] },
      { label: "Compliance vault", href: "/compliance", icon: FileCheck2, module: "security", permission: "compliance.view", keywords: ["fire noc", "certificate", "affiliation", "expiry", "renewal", "documents"] },
      { label: "CCTV", href: "/cctv", icon: Cctv, module: "cctv", permission: "cctv.manage", keywords: ["camera", "consent", "surveillance", "nvr"] },
      { label: "Classroom CCTV", href: "/my-cctv", icon: Cctv, module: "cctv", roles: ["parent", "student"], keywords: ["camera", "watch", "consent"] },
    ],
  },
  {
    label: "Transport",
    items: [
      { label: "Transport", href: "/transport", icon: Bus, module: "transport", permission: "transport.view", keywords: ["bus", "route", "vehicle", "driver", "gps", "live", "sos"] },
      { label: "School bus", href: "/my-transport", icon: Bus, module: "transport", roles: ["parent", "student"], keywords: ["bus", "track", "where is the bus"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "School profile", href: "/settings/school", icon: Settings2, permission: "school.view", keywords: ["settings", "timezone"] },
      { label: "Modules", href: "/settings/modules", icon: ToggleRight, permission: "modules.manage", keywords: ["features"] },
      { label: "Plan & billing", href: "/settings/billing", icon: CreditCard, permission: "billing.view", keywords: ["subscription", "upgrade", "pricing", "trial"] },
      { label: "Storage", href: "/settings/storage", icon: HardDrive, permission: "school.manage", keywords: ["files", "space", "photos", "documents", "drive", "delete", "uploads"] },
      { label: "Users & roles", href: "/settings/users", icon: Users, permission: "users.view", keywords: ["staff", "accounts", "permissions"] },
      { label: "Email", href: "/settings/emails", icon: Mail, permission: "emails.view", keywords: ["brevo", "smtp", "sent", "receipts"] },
      { label: "SMS and WhatsApp", href: "/settings/messaging", icon: Smartphone, permission: "emails.view", keywords: ["sms", "whatsapp", "text message", "twilio", "msg91"] },
      { label: "Attendance machines", href: "/settings/devices", icon: Fingerprint, module: "attendance", permission: "devices.manage", keywords: ["biometric", "fingerprint", "face", "zkteco", "adms"] },
      { label: "Audit log", href: "/settings/audit", icon: ScrollText, permission: "audit.view", keywords: ["history", "activity"] },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "My account", href: "/account", icon: KeyRound, keywords: ["password", "profile"] },
    ],
  },
];

export function canSee(item: NavItem, me: Me) {
  const isSuper = me.role === "super_admin";
  if (item.superAdminOnly) return isSuper;
  if (isSuper) return !item.module && !item.permission; // super admin has no school context
  if (item.module && !me.modules.includes(item.module)) return false;
  if (item.permission && !me.permissions.includes(item.permission)) return false;
  if (item.roles && !item.roles.includes(me.role)) return false;
  return true;
}

export function visibleGroups(me: Me): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, me)) })).filter((g) => g.items.length);
}

export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV_GROUPS.flatMap((g) => g.items);
  return all
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
