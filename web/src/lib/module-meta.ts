import {
  BarChart3, Bot, Boxes, Building, Bus, CalendarCheck, Cctv, ClipboardList, Landmark, Library, MessageSquare,
  Shield, UserCog, Users, Wallet, BookOpen, type LucideIcon,
} from "lucide-react";

export const MODULE_META: Record<string, { icon: LucideIcon; description: string }> = {
  students: { icon: Users, description: "Admissions, profiles, promotions and documents" },
  academics: { icon: BookOpen, description: "Classes, subjects, timetables, homework and syllabus" },
  attendance: { icon: CalendarCheck, description: "Daily and period attendance, QR ID cards and leave requests" },
  fees: { icon: Wallet, description: "Fee structures, invoices, online payments and receipts" },
  accounts: { icon: Landmark, description: "Expenses, ledgers and Tally export" },
  exams: { icon: ClipboardList, description: "Exams, marks, report cards and online tests" },
  communication: { icon: MessageSquare, description: "SMS, WhatsApp, email, chat and surveys" },
  transport: { icon: Bus, description: "Routes, live bus tracking and boarding" },
  hr: { icon: UserCog, description: "Staff records, leave and payroll" },
  library: { icon: Library, description: "Catalogue, issue and return, fines" },
  hostel: { icon: Building, description: "Rooms, allocations and hostel attendance" },
  inventory: { icon: Boxes, description: "Stock, purchase orders and asset register" },
  security: { icon: Shield, description: "Gate passes, visitors and campus workers" },
  cctv: { icon: Cctv, description: "Consent-based camera access for parents" },
  ai: { icon: Bot, description: "Ask questions about your school's data" },
  analytics: { icon: BarChart3, description: "Trends and custom reports" },
};
