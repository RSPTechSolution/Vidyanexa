export interface PageMeta {
  total: number;
  page: number;
  page_size: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: PageMeta | null;
  error?: { code: string; message: string; details?: unknown };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface PlanBrief {
  code: string;
  name: string;
  is_custom: boolean;
}

export interface SchoolBrief {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string;
  currency: string;
  plan: PlanBrief;
  subscription_status: string;
  trial_ends_at: string | null;
  brand_color?: string | null;
}

export interface Me {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  school_id: string | null;
  must_change_password: boolean;
  last_login_at: string | null;
  photo_file_id?: string | null;
  school: SchoolBrief | null;
  modules: string[];
  permissions: string[];
}

export interface School {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  language: string;
  is_active: boolean;
  plan: PlanBrief;
  subscription_status: string;
  billing_cycle: string;
  trial_ends_at: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface ModuleState {
  module: string;
  label: string;
  is_enabled: boolean;
  in_plan: boolean;
  upgrade_plan: string | null;
}

export interface User {
  id: string;
  school_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  employee_id: string | null;
  designation: string | null;
  license_no: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  price_monthly: number;
  price_yearly: number;
  max_students: number | null;
  max_staff: number | null;
  storage_gb: number;
  modules: string[];
  features: string[];
  is_public: boolean;
  is_custom: boolean;
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface PricingCatalog {
  currency: string;
  gst_rate: number;
  trial_days: number;
  yearly_months_charged: number;
  platform_fee: number;
  modules: { module: string; label: string; monthly: number; core: boolean }[];
  student_tiers: { from: number; to: number; per_student: number }[];
  min_students: number;
  max_students: number;
}

export interface Quote {
  modules: string[];
  students: number;
  max_staff: number;
  storage_gb: number;
  platform_fee: number;
  module_total: number;
  student_total: number;
  monthly: number;
  yearly: number;
}

export type BillingCycle = "monthly" | "yearly";

export interface Subscription {
  plan: Plan;
  status: string;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  trial_days_left: number;
  trial_expired: boolean;
  current_period_end: string | null;
  can_self_change: boolean;
  usage: { students: number; staff: number; storage_bytes: number };
  available_plans: Plan[];
  gst_rate: number;
  online_payment: boolean;
  test_mode: boolean;
}

/** A school's payment to Vidyanexa for its plan (the only thing paid online). */
export interface SubscriptionPayment {
  id: string;
  invoice_no: string | null;
  plan_name: string;
  billing_cycle: BillingCycle;
  base_amount: number;
  gst_rate: number;
  gst_amount: number;
  total: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

export interface Checkout {
  payment_id: string;
  plan_name: string;
  billing_cycle: BillingCycle;
  base_amount: number;
  gst_rate: number;
  gst_amount: number;
  total: number;
  gateway: string;
  test_mode: boolean;
}

export interface Lead {
  id: string;
  kind: "contact" | "quote" | "upgrade";
  status: "new" | "contacted" | "closed";
  name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
  message: string | null;
  students: number | null;
  modules: string[];
  quoted_monthly: number | null;
  plan_code: string | null;
  created_at: string;
}

export interface DashboardSummary {
  plan: PlanBrief;
  subscription_status: string;
  trial_days_left: number;
  active_users: number;
  roles: { role: string; count: number }[];
  signins: { date: string; count: number }[];
  signins_total: number;
  student_logins: number;
  students: { used: number; limit: number | null };
  staff: { used: number; limit: number | null };
  /** Bytes. */
  storage: { used: number; limit: number | null };
  modules_enabled: number;
  modules_in_plan: number;
}

export interface SectionItem {
  id: string;
  class_id: string;
  name: string;
  capacity: number | null;
  class_teacher_id: string | null;
  class_teacher_name: string | null;
  student_count: number;
}

export interface ClassItem {
  id: string;
  name: string;
  sort_order: number;
  sections: SectionItem[];
  student_count: number;
}

export interface Guardian {
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string;
  relationship: string;
  is_primary: boolean;
}

export interface Student {
  id: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender: "male" | "female" | "other";
  date_of_birth: string;
  admission_date: string;
  class_id: string;
  section_id: string;
  class_name: string | null;
  section_name: string | null;
  roll_no: number | null;
  blood_group: string | null;
  address: string | null;
  status: "active" | "inactive" | "alumni";
  user_id: string | null;
  guardian_count: number;
  created_at: string;
}

export interface StudentDetail extends Student {
  photo_file_id?: string | null;
  guardians: Guardian[];
  login_email: string | null;
}

export interface StudentOption {
  id: string;
  name: string;
  admission_no: string;
  class_section: string;
  has_login: boolean;
}

export interface RoleRules {
  roles: Record<string, { required: string[]; optional: string[] }>;
  labels: Record<string, string>;
  relationships: string[];
  linked_roles: string[];
}

export interface UserDetail extends PersonExtras {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  employee_id: string | null;
  designation: string | null;
  license_no: string | null;
  is_active: boolean;
  children: LinkedChild[];
  student_id: string | null;
  student_name: string | null;
  student: LinkedChild | null;
  class_teacher_of: { section_id: string; label: string; students: number }[];
  teaching: string[];
  activity: { action: string; entity_type: string | null; entity_id: string | null; meta: Record<string, unknown>; created_at: string }[];
  // From UserOut
  must_change_password?: boolean;
  last_login_at?: string | null;
  created_at?: string;
  photo_file_id?: string | null;
}

export interface LinkedChild {
  student_id: string;
  name: string;
  class_section: string;
  relationship: string;
  admission_no: string | null;
  attendance_percent: number | null;
  fee_due: number | null;
  fee_overdue: boolean;
}

// ---- timetable -------------------------------------------------------------------------------

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  color: string;
  teacher_count: number;
  periods_per_week: number;
}

export interface Period {
  id: string;
  name: string;
  start_time: string; // "08:00:00"
  end_time: string;
  sort_order: number;
  is_break: boolean;
}

export interface TimetableEntry {
  id: string;
  day: number; // 1 = Monday .. 6 = Saturday
  period_id: string;
  section_id: string;
  section_label: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  teacher_id: string | null;
  teacher_name: string | null;
  room: string | null;
}

export interface TimetableView {
  title: string;
  subtitle: string | null;
  kind: "section" | "teacher";
  owner_id: string;
  periods: Period[];
  entries: TimetableEntry[];
}

export interface TeacherInfo {
  id: string;
  full_name: string;
  designation: string | null;
  employee_id: string | null;
  subject_ids: string[];
  periods_per_week: number;
  unavailable: { day: number; period_id: string }[];
}

export interface AvailableTeacher {
  id: string;
  full_name: string;
  status: "free" | "busy" | "unavailable" | "current";
  busy_with: string | null;
  qualified: boolean;
  periods_per_week: number;
  periods_that_day: number;
}

// ---- attendance ------------------------------------------------------------------------------

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "leave";
export interface AttendanceCounts { present: number; absent: number; late: number; half_day: number; leave: number }

export interface SectionCard {
  section_id: string;
  label: string;
  class_teacher: string | null;
  is_class_teacher: boolean;
  students: number;
  marked: number;
  present: number;
  absent: number;
  marked_by: string | null;
}

export interface RosterEntry {
  student_id: string;
  name: string;
  admission_no: string;
  roll_no: number | null;
  gender: string;
  status: AttendanceStatus | null;
  remark: string | null;
  recent_percent: number | null; // last 30 days
}

export interface Roster {
  section_id: string;
  label: string;
  date: string;
  editable: boolean;
  locked_reason: string | null;
  marked_by: string | null;
  marked_at: string | null;
  students: RosterEntry[];
  counts: AttendanceCounts;
}

export interface StudentAttendance {
  student_id: string;
  name: string;
  class_section: string;
  month: string;
  days: { date: string; status: AttendanceStatus; remark: string | null }[];
  month_counts: AttendanceCounts;
  month_percent: number | null;
  year_counts: AttendanceCounts;
  year_percent: number | null;
}

export interface AttendanceReportRow { student_id: string; name: string; roll_no: number | null; counts: AttendanceCounts; percent: number | null }

export interface SectionReport {
  section_id: string;
  label: string;
  month: string;
  school_days: number;
  rows: AttendanceReportRow[];
  average_percent: number | null;
}

export interface AttendanceOverview {
  date: string;
  sections_total: number;
  sections_marked: number;
  students_total: number;
  counts: AttendanceCounts;
  percent: number | null;
  sections: SectionCard[];
  trend: { date: string; percent: number | null; marked: number }[];
  low_attendance: AttendanceReportRow[];
}

// ---- fees ------------------------------------------------------------------------------------

export interface FeeCategory { id: string; name: string; description: string | null; is_active: boolean }

export interface StructureMatrix {
  categories: FeeCategory[];
  classes: { class_id: string; class_name: string; students: number; amounts: Record<string, number>; total: number }[];
}

export interface InvoiceRow {
  id: string;
  invoice_no: string;
  student_id: string;
  student_name: string;
  admission_no: string;
  class_section: string;
  term: string;
  due_date: string;
  total: number;
  discount: number;
  paid: number;
  balance: number;
  status: "unpaid" | "partial" | "paid" | "cancelled";
  overdue: boolean;
}

export interface FeePayment {
  id: string;
  receipt_no: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  paid_at: string;
  collected_by: string | null;
}

export interface InvoiceDetail extends InvoiceRow {
  academic_year: string;
  issue_date: string;
  discount_reason: string | null;
  items: { name: string; amount: number }[];
  payments: FeePayment[];
  guardian_phone: string | null;
}

export interface FeeSummary {
  collected_today: number;
  collected_month: number;
  collected_year: number;
  billed_year: number;
  outstanding: number;
  overdue: number;
  overdue_invoices: number;
  collection_rate: number | null;
  daily: { date: string; amount: number }[];
  by_method: { method: string; amount: number; count: number }[];
  by_class: { class_name: string; outstanding: number; students: number }[];
  recent: FeePayment[];
}

export interface Receipt {
  payment: FeePayment;
  invoice: InvoiceDetail;
  school_name: string;
  school_address: string | null;
  school_phone: string | null;
  balance_after: number;
}

export interface MyFees {
  children: { student_id: string; name: string; class_section: string; due: number; overdue: number; next_due_date: string | null; invoices: InvoiceDetail[] }[];
  total_due: number;
}


// ---- exams -----------------------------------------------------------------------------------

export type ExamStatus = "draft" | "upcoming" | "ongoing" | "marks_entry" | "published";

export interface Exam {
  id: string;
  name: string;
  kind: "unit_test" | "term" | "final";
  academic_year: string;
  start_date: string | null;
  end_date: string | null;
  published_at: string | null;
  status: ExamStatus;
  classes: number;
  papers: number;
  marks_entered: number;
  marks_expected: number;
}

export interface ExamPaper {
  id: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  exam_date: string | null;
  max_marks: number;
  pass_marks: number;
  marks_entered: number;
  students: number;
}

export interface ExamDetail extends Exam {
  classes_detail: { class_id: string; class_name: string; papers: ExamPaper[] }[];
}

export interface MarksSheetRef {
  paper_id: string;
  section_id: string;
  section_label: string;
  subject_name: string;
  subject_color: string;
  exam_date: string | null;
  max_marks: number;
  entered: number;
  students: number;
}

export interface MarksSheet {
  paper_id: string;
  section_id: string;
  exam_name: string;
  section_label: string;
  subject_name: string;
  max_marks: number;
  pass_marks: number;
  editable: boolean;
  locked_reason: string | null;
  rows: { student_id: string; name: string; roll_no: number | null; marks: number | null; absent: boolean }[];
}

export interface SubjectResult { subject_name: string; max_marks: number; pass_marks: number; marks: number | null; absent: boolean; grade: string | null; passed: boolean | null }

export interface StudentResult {
  student_id: string;
  name: string;
  roll_no: number | null;
  subjects: SubjectResult[];
  total: number;
  max_total: number;
  percent: number | null;
  grade: string | null;
  passed: boolean;
  rank: number | null;
  remark: string | null;
}

export interface SectionResults {
  exam_id: string;
  exam_name: string;
  section_label: string;
  published: boolean;
  students: StudentResult[];
  subjects: { subject_name: string; average: number | null; highest: number | null; pass_rate: number | null }[];
  average_percent: number | null;
  pass_rate: number | null;
}

export interface ReportCard {
  exam_id: string;
  exam_name: string;
  academic_year: string;
  school_name: string;
  school_address: string | null;
  student_name: string;
  admission_no: string;
  class_section: string;
  roll_no: number | null;
  date_of_birth: string;
  class_teacher: string | null;
  result: StudentResult;
  class_size: number;
  attendance_percent: number | null;
  published: boolean;
  co_scholastic?: { area: string; grade: string }[];
}

export interface ChildResults {
  student_id: string;
  name: string;
  class_section: string;
  exams: { exam_id: string; exam_name: string; kind: string; published_at: string; percent: number | null; grade: string | null; rank: number | null; class_size: number; passed: boolean }[];
  upcoming: ExamPaper[];
}

// ---- notices & homework ----------------------------------------------------------------------

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: "everyone" | "staff" | "families" | "sections";
  audience_label: string;
  section_ids: string[];
  priority: "normal" | "important" | "urgent";
  pinned: boolean;
  created_at: string;
  author: string | null;
  read: boolean;
  can_edit: boolean;
  reads: number | null;
  recipients: number | null;
}

export interface HomeworkItem {
  attachments?: StoredFile[];
  id: string;
  section_id: string;
  section_label: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  title: string;
  details: string | null;
  assigned_on: string;
  due_date: string;
  teacher: string | null;
  students: number;
  done: number;
  checked: number;
  can_edit: boolean;
}

export type HomeworkState = "pending" | "done" | "checked" | "incomplete";

export interface HomeworkDetail extends HomeworkItem {
  roster: { student_id: string; name: string; roll_no: number | null; status: HomeworkState; note: string | null; remark: string | null }[];
}

export interface MyHomework extends HomeworkItem {
  student_id: string;
  student_name: string;
  status: HomeworkState;
  note: string | null;
  remark: string | null;
  overdue: boolean;
}

export interface HomeworkTarget { section_id: string; section_label: string; subjects: { id: string; name: string; color: string }[] }

export interface StoredFile {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  label: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ---- syllabus & lesson plans ------------------------------------------------------------------

export interface SyllabusTopic {
  id: string;
  unit: string | null;
  title: string;
  planned_month: string | null;
  sort_order: number;
  done_sections: string[];
  completed_on: Record<string, string>;
}

export interface SyllabusView {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  sections: { id: string; name: string; editable: boolean }[];
  can_edit_topics: boolean;
  topics: SyllabusTopic[];
}

export interface CoverageRow {
  section_id: string;
  section_label: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  total: number;
  done: number;
  percent: number | null;
  behind: number;
  last_topic: string | null;
}

export interface ChildSyllabus {
  student_id: string;
  name: string;
  class_section: string;
  subjects: CoverageRow[];
}

export interface LessonPlan {
  id: string;
  section_id: string;
  section_label: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  topic_id: string | null;
  topic_title: string | null;
  date: string;
  title: string;
  objectives: string | null;
  activities: string | null;
  resources: string | null;
  status: "planned" | "taught";
  teacher: string | null;
  can_edit: boolean;
}

// ---- certificates, admissions, promotion, substitutions ---------------------------------------

export interface Certificate {
  id: string;
  student_id: string;
  student_name: string;
  admission_no: string;
  class_section: string;
  kind: "transfer" | "bonafide" | "character";
  serial_no: string;
  issued_on: string;
  details: Record<string, string>;
  issued_by: string | null;
  cancelled: boolean;
}

export type EnquiryStatus = "new" | "contacted" | "visit" | "applied" | "admitted" | "lost";

export interface Enquiry {
  id: string;
  student_name: string;
  date_of_birth: string | null;
  gender: string | null;
  class_id: string | null;
  class_name: string | null;
  parent_name: string;
  phone: string;
  email: string | null;
  previous_school: string | null;
  source: string;
  status: EnquiryStatus;
  follow_up_on: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  notes: { at: string; by: string; text: string }[];
  student_id: string | null;
  created_at: string;
  overdue: boolean;
}

export interface EnquirySummary {
  by_status: Record<EnquiryStatus, number>;
  due_today: number;
  overdue: number;
  this_month: number;
  admitted_this_month: number;
  conversion: number | null;
}

export type PromotionAction = "promote" | "repeat" | "leave" | "graduate";

export interface PromotionPreview {
  section_id: string;
  section_label: string;
  next_class_id: string | null;
  next_class_name: string | null;
  next_sections: { id: string; name: string; students: number; capacity: number | null }[];
  default_section_id: string | null;
  students: {
    student_id: string; name: string; admission_no: string; roll_no: number | null; exam: string | null;
    percent: number | null; passed: boolean | null; suggested: PromotionAction;
  }[];
}

export interface Substitution {
  id: string;
  date: string;
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  section_id: string;
  section_label: string;
  subject_name: string;
  subject_color: string;
  absent_teacher_id: string | null;
  absent_teacher: string | null;
  substitute_id: string | null;
  substitute: string | null;
  note: string | null;
}

export interface SubstitutionDay {
  date: string;
  absent_teachers: { id: string; full_name: string; periods: number; covered: number }[];
  periods: Substitution[];
}

// ---- calendar, leave, scan, devices, period-wise ------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  kind: "holiday" | "vacation" | "event" | "exam" | "ptm";
  start_date: string;
  end_date: string;
  description: string | null;
  closed: boolean;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  student_name: string;
  class_section: string;
  from_date: string;
  to_date: string;
  days: number;
  kind: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  can_decide: boolean;
  can_cancel: boolean;
}

export interface ScanResult {
  student_id: string;
  name: string;
  class_section: string;
  photo_file_id: string | null;
  status: string;
  already: boolean;
  time: string;
}

export interface BiometricDevice {
  id: string;
  serial_no: string;
  name: string;
  location: string | null;
  is_enabled: boolean;
  last_seen: string | null;
  punches: number;
  online: boolean;
}

export interface Punch { pin: string; punched_at: string; device: string; matched: string | null }

export interface PeriodCard {
  entry_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  section_id: string;
  section_label: string;
  subject_name: string;
  subject_color: string;
  marked: boolean;
  absent: number;
  cover: boolean;
}

export interface PeriodRoster {
  entry_id: string;
  date: string;
  label: string;
  marked: boolean;
  students: { student_id: string; name: string; roll_no: number | null; day_status: string | null; absent: boolean }[];
}

export interface BunkRow { student_id: string; name: string; section_label: string; periods: string[] }

// ---- accounts -------------------------------------------------------------------------------------

export interface LedgerHead { id: string; kind: "income" | "expense"; name: string; is_active: boolean; total_this_year: number }

export interface AccountEntry {
  id: string;
  voucher_no: string;
  kind: "income" | "expense";
  head_id: string;
  head_name: string;
  date: string;
  amount: number;
  party: string | null;
  method: string;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  attachments: number;
}

export interface AccountsSummary {
  start: string;
  end: string;
  fee_income: number;
  other_income: number;
  expense: number;
  net: number;
  income_by_head: { name: string; amount: number }[];
  expense_by_head: { name: string; amount: number }[];
  by_month: { month: string; income: number; expense: number }[];
  cash_in_hand: number;
}


// ---- online tests, co-scholastic, live classes ----------------------------------------------------

export type QuestionKind = "single" | "multiple" | "true_false" | "short";

export interface Question {
  id: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  kind: QuestionKind;
  text: string;
  options: { id: string; text: string }[];
  answer: string[];
  marks: number;
  explanation: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  used_in: number;
  can_edit: boolean;
}

export interface OnlineTest {
  id: string;
  title: string;
  instructions: string | null;
  class_id: string;
  subject_id: string;
  subject_name: string;
  section_ids: string[];
  sections_label: string;
  question_ids: string[];
  questions: number;
  max_marks: number;
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
  shuffle: boolean;
  show_results: "after_submit" | "after_close" | "never";
  published: boolean;
  status: "draft" | "upcoming" | "open" | "closed";
  attempts: number;
  submitted: number;
  average: number | null;
  can_edit: boolean;
}

export interface MyTest {
  test_id: string;
  title: string;
  subject_name: string;
  student_id: string;
  student_name: string;
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
  questions: number;
  max_marks: number;
  state: "upcoming" | "open" | "in_progress" | "submitted" | "missed";
  score: number | null;
  percent: number | null;
  released: boolean;
}

export interface AttemptView {
  test_id: string;
  title: string;
  instructions: string | null;
  subject_name: string;
  deadline: string;
  submitted: boolean;
  questions: { id: string; kind: QuestionKind; text: string; options: { id: string; text: string }[]; marks: number }[];
  answers: Record<string, string[] | string>;
}

export interface AttemptResult {
  test_id: string;
  title: string;
  student_id: string;
  student_name: string;
  submitted_at: string | null;
  score: number | null;
  max_marks: number;
  percent: number | null;
  needs_marking: boolean;
  released: boolean;
  questions: {
    id: string; kind: QuestionKind; text: string; options: { id: string; text: string }[]; marks: number;
    your_answer: string[] | string | null; correct: string[] | null; awarded: number | null; explanation: string | null;
  }[];
}

export interface TestResults {
  test: OnlineTest;
  rows: { attempt_id: string | null; student_id: string; name: string; roll_no: number | null; section_label: string;
          state: "not_started" | "in_progress" | "submitted"; score: number | null; percent: number | null; needs_marking: boolean;
          submitted_at: string | null }[];
  questions: { question_id: string; text: string; kind: QuestionKind; correct_percent: number | null; answered: number }[];
}

export interface CoSheet {
  exam_id: string;
  section_id: string;
  label: string;
  areas: { id: string; name: string; sort_order: number }[];
  rows: { student_id: string; name: string; roll_no: number | null; grades: Record<string, string> }[];
  editable: boolean;
}

export interface LiveClass {
  id: string;
  title: string;
  section_ids: string[];
  sections_label: string;
  subject_name: string | null;
  subject_color: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  meeting_url: string;
  provider: string;
  notes: string | null;
  teacher: string | null;
  cancelled: boolean;
  state: "upcoming" | "live" | "ended" | "cancelled";
  can_edit: boolean;
}


// ---- messaging, chat, PTM, surveys --------------------------------------------------------------

export interface MessagingStatus { sms_provider: string; whatsapp_provider: string; events: Record<string, string>; chosen: Record<string, string[]>; today: Record<string, number> }
export interface MessageLogRow { id: string; channel: string; to: string; body: string; kind: string; status: string; error: string | null; created_at: string }
export interface ChatContact { student_id: string; student_name: string; user_id: string; name: string; role: string }
export interface Conversation {
  id: string; student_id: string; student_name: string; other_id: string; other_name: string; other_role: string;
  last_message: string | null; last_message_at: string | null; unread: number;
}
export interface ChatMessage { id: string; mine: boolean; sender: string | null; body: string; created_at: string; read: boolean }
export interface PtmEvent {
  id: string; title: string; date: string; start_time: string; end_time: string; slot_minutes: number; sections_label: string;
  location: string | null; notes: string | null; booked: number; slots: number; past: boolean;
}
export interface PtmChildSlots {
  student_id: string; student_name: string; teacher_id: string | null; teacher_name: string | null; booking: string | null;
  slots: { time: string; free: boolean; mine: boolean }[];
}
export interface PtmScheduleRow { time: string; student_id: string | null; student_name: string | null; parent: string | null; phone: string | null; note: string | null }
export type SurveyQuestionKind = "choice" | "multi" | "rating" | "text";
export interface SurveyQuestion { id: string; kind: SurveyQuestionKind; text: string; options: string[]; required: boolean }
export interface Survey {
  id: string; title: string; description: string | null; audience: string; audience_label: string; section_ids: string[];
  questions: SurveyQuestion[]; anonymous: boolean; closes_at: string | null; published: boolean; open: boolean; responses: number;
  answered: boolean; can_edit: boolean;
}
export interface SurveyResults {
  survey: Survey; responses: number; audience_size: number;
  questions: { id: string; kind: SurveyQuestionKind; text: string; answers: number; counts: Record<string, number>; average: number | null; texts: { text: string; by: string | null }[] }[];
}


// ---- transport ------------------------------------------------------------------------------------

export interface Vehicle {
  id: string; number: string; model: string | null; capacity: number; driver_id: string | null; driver_name: string | null; driver_phone: string | null;
  helper_name: string | null; helper_phone: string | null; insurance_until: string | null; fitness_until: string | null; permit_until: string | null;
  is_active: boolean; routes: string[]; riders: number; expiring: string[];
}
export interface BusStop { id: string; name: string; sort_order: number; lat: number | null; lng: number | null; pickup_time: string | null; drop_time: string | null; riders: number }
export interface BusRoute {
  id: string; name: string; vehicle_id: string | null; vehicle_number: string | null; driver_name: string | null; monthly_fee: number;
  is_active: boolean; stops: BusStop[]; riders: number; capacity: number | null;
}
export interface Rider { student_id: string; name: string; class_section: string; stop_id: string | null; stop_name: string | null; parent_phone: string | null }
export interface Trip {
  id: string; route_id: string; route_name: string; vehicle_number: string | null; driver_name: string | null; driver_phone: string | null;
  direction: "pickup" | "drop"; status: string; started_at: string; ended_at: string | null; lat: number | null; lng: number | null; speed: number | null;
  last_ping_at: string | null; stale: boolean; on_board: number; riders: number; stops: BusStop[]; path: number[][];
}
export interface ChildTransport { student_id: string; name: string; route: BusRoute | null; stop: BusStop | null; trip: Trip | null; today: { event: string; at: string; direction: string }[] }
export interface SosAlert {
  id: string; route_name: string | null; vehicle_number: string | null; raised_by: string | null; phone: string | null; lat: number | null; lng: number | null;
  message: string | null; raised_at: string; resolved_at: string | null; resolution: string | null;
}


// ---- HR and payroll -------------------------------------------------------------------------------

export interface StaffRow {
  user_id: string; full_name: string; email: string; phone: string | null; role: string; employee_id: string | null; designation: string | null;
  department: string | null; date_of_joining: string | null; gross_monthly: number; has_bank: boolean; today: string | null;
}
export interface StaffDetail extends StaffRow { profile: Record<string, string | number | boolean | null>; leave_balance: LeaveBalance[] }
export interface LeaveBalance { id: string; name: string; code: string; allowed: number; used: number; left: number | null; paid: boolean }
export interface StaffDayRow { user_id: string; full_name: string; role: string; designation: string | null; status: string | null; check_in: string | null; check_out: string | null; source: string | null; on_leave: boolean }
export interface LeaveTypeRow { id: string; name: string; code: string; days_per_year: number; paid: boolean; is_active: boolean }
export interface StaffLeave {
  id: string; user_id: string; full_name: string; leave_type: string; code: string; from_date: string; to_date: string; half_day: boolean; days: number;
  reason: string; status: string; decided_by: string | null; decision_note: string | null; created_at: string; can_decide: boolean; can_cancel: boolean;
}
export interface Payslip {
  id: string; user_id: string; full_name: string; employee_id: string | null; designation: string | null; days_in_month: number; paid_days: number;
  lop_days: number; earnings: Record<string, number>; deductions: Record<string, number>; adjustments: Record<string, number>; gross: number;
  total_deductions: number; net: number; note: string | null; bank_ready: boolean;
}
export interface PayrollRun { id: string; month: string; status: "draft" | "finalised" | "paid"; staff: number; gross: number; net: number; finalised_at: string | null; paid_on: string | null; payslips: Payslip[] }


// ---- library, hostel, inventory ---------------------------------------------------------------------

export interface BookCopy { id: string; accession_no: string; status: "available" | "issued" | "lost" | "damaged" | "withdrawn"; borrower: string | null; due_on: string | null }
export interface Book {
  id: string; title: string; author: string | null; isbn: string | null; publisher: string | null; category: string | null; rack: string | null;
  total: number; available: number; copies: BookCopy[];
}
export interface BookIssue {
  id: string; accession_no: string; title: string; borrower: string; borrower_kind: "student" | "staff"; class_section: string | null; issued_on: string;
  due_on: string; returned_on: string | null; overdue_days: number; fine: number; fine_paid: boolean;
}
export interface LibrarySettings { loan_days: number; fine_per_day: number; max_books_student: number; max_books_staff: number }
export interface LibraryStats { titles: number; copies: number; issued: number; overdue: number; fines_due: number }
export interface HostelOccupant { allocation_id: string; student_id: string; name: string; class_section: string; from_date: string }
export interface HostelRoom { id: string; number: string; floor: string | null; capacity: number; occupants: HostelOccupant[] }
export interface Hostel {
  id: string; name: string; kind: "boys" | "girls" | "mixed"; warden_id: string | null; warden_name: string | null; monthly_fee: number; address: string | null;
  rooms: number; beds: number; occupied: number; room_list: HostelRoom[];
}
export interface MyHostel { student_id: string; name: string; hostel: string; room: string; floor: string | null; since: string; warden: string | null; warden_phone: string | null }
export interface StockItem { id: string; name: string; category: string | null; unit: string; quantity: number; reorder_level: number; location: string | null; low: boolean; last_move_at: string | null }
export interface StockMove { id: string; kind: "in" | "out" | "adjust"; quantity: number; unit_cost: number | null; party: string | null; note: string | null; balance_after: number; by: string | null; at: string }
export interface Asset {
  id: string; tag: string; name: string; category: string | null; location: string | null; purchased_on: string | null; cost: number | null; vendor: string | null;
  warranty_until: string | null; warranty_ok: boolean | null; condition: "good" | "needs_repair" | "broken" | "disposed"; assigned_to: string | null;
  assigned_name: string | null; notes: string | null;
}


// ---- gate and security ----------------------------------------------------------------------------

export interface Visitor {
  id: string; name: string; phone: string | null; purpose: string; meeting: string | null; host_id: string | null; host_name: string | null;
  id_proof: string | null; vehicle_no: string | null; people: number; badge_no: string | null; status: "expected" | "in" | "out" | "cancelled";
  expected_on: string | null; in_at: string | null; out_at: string | null; photo_file_id: string | null; logged_by: string | null; can_cancel: boolean;
}
export interface VisitorLookup { name: string; purpose: string; meeting: string | null; visits: number; last_at: string | null }
export interface GatePass {
  id: string; student_id: string; student_name: string; class_section: string; photo_file_id: string | null; reason: string; pickup_name: string;
  pickup_relation: string; pickup_phone: string | null; leave_at: string; status: "pending" | "approved" | "rejected" | "cancelled" | "used";
  code: string | null; requested_by: string | null; decided_by: string | null; decision_note: string | null; used_at: string | null; verified_by: string | null;
  can_decide: boolean; can_cancel: boolean;
}
export interface Worker {
  id: string; name: string; phone: string | null; trade: string; agency: string | null; id_proof: string | null; police_verified: boolean;
  verified_on: string | null; valid_until: string | null; is_active: boolean; notes: string | null; photo_file_id: string | null;
  on_campus_since: string | null; can_enter: boolean; blocked_reason: string | null;
}
export interface GateSummary { visitors_inside: number; visitors_today: number; expected_today: number; workers_inside: number; passes_pending: number; passes_today: number; compliance_due: number }
export interface ComplianceDoc {
  id: string; title: string; category: string; reference_no: string | null; authority: string | null; issued_on: string | null; expires_on: string | null;
  notes: string | null; state: "valid" | "expiring" | "expired" | "no_expiry"; days_left: number | null; files: number;
}
export interface CctvSettings { policy: string; parent_viewing: boolean }
export interface Camera {
  id: string; name: string; location: string | null; section_id: string | null; section_label: string | null; stream_url: string | null;
  parent_viewable: boolean; is_active: boolean; consent: { students: number; yes: number; no: number; unanswered: number; complete: boolean } | null;
  watchable: boolean; blocked_reason: string | null;
}
export interface ConsentRow { student_id: string; name: string; class_section: string; consent: boolean | null; decided_at: string | null }
export interface ConsentCoverage { section_id: string; label: string; students: number; yes: number; no: number; unanswered: number }
export interface CctvViewRow { camera: string; user: string | null; role: string | null; at: string }


// ---- analytics -----------------------------------------------------------------------------------

export interface AnalyticsReport {
  frm: string; to: string; academic_year: string; students: number; new_admissions: number;
  enrolment: { class_id: string; name: string; students: number; boys: number; girls: number }[];
  attendance_percent: number | null; attendance_trend: { date: string; percent: number | null }[];
  class_attendance: { class_id: string; name: string; percent: number | null }[]; low_attendance: number;
  fees: {
    billed: number; collected: number; outstanding: number; collection_percent: number | null; monthly: { month: string; amount: number }[];
    aging: { label: string; amount: number }[]; defaulters: { student_id: string; name: string; class_section: string; balance: number; days_overdue: number }[];
  };
  exam: { exam_id: string; name: string; pass_rate: number | null; classes: { class_id: string; name: string; students: number; average: number; pass_rate: number | null }[]; subjects: { name: string; average: number }[] } | null;
  at_risk: { student_id: string; name: string; admission_no: string; class_section: string; reasons: string[] }[]; at_risk_total: number;
}

export interface AiTemplate { id: string; title: string; example: string }
export interface AiStatus { mode: "rules" | "ai"; templates: AiTemplate[]; left_today: number }
export interface AiAnswer { template: string | null; mode: "rules" | "ai"; text: string; columns: string[]; rows: (string | number | null)[][]; link: string | null; suggestions: string[] }

export interface MyClass {
  section_id: string;
  label: string;
  is_class_teacher: boolean;
  students: number;
  attendance_marked: boolean;
  present: number;
  absent: number;
  on_leave: number;
  pending_leave: number;
  pending_gate_passes: number;
  fees_enabled: boolean;
  students_overdue: number;
  overdue_amount: number;
}

export interface ClassStudent {
  student_id: string;
  name: string;
  roll_no: number | null;
  admission_no: string;
  photo_file_id: string | null;
  today: AttendanceStatus | null;
  attendance_percent: number | null;
  days_absent: number;
  fee_due: number;
  fee_overdue: boolean;
  guardians: string[];
}

export interface MyClassDetail {
  section_id: string;
  label: string;
  class_teacher: string | null;
  fees_enabled: boolean;
  month_start: string;
  students: ClassStudent[];
}

export interface ReminderResult {
  invoices: number;
  families: number;
  emails: number;
  skipped_recent: number;
}

// ---- profiles: everything about one person across the modules ----------------------------

export interface LoanRow { title: string; author: string | null; accession_no: string; issued_on: string; due_on: string; returned_on: string | null; overdue: boolean; fine: number }
export interface LibrarySummary { current: LoanRow[]; recent_returns: LoanRow[]; returned_total: number; fines_due: number }
export interface RequestRow { kind: "leave" | "gate_pass" | "staff_leave"; title: string; detail: string | null; status: string; on: string; student_id: string | null; student_name: string | null }
export interface PtmRow { title: string; on: string; slot: string; teacher_name: string | null; student_name: string | null }

export interface StudentOverview {
  library: LibrarySummary | null;
  hostel: { hostel: string; room: string; floor: string | null; since: string } | null;
  bus: { route: string; stop: string | null; pickup_time: string | null; drop_time: string | null; vehicle_number: string | null; driver_name: string | null; driver_phone: string | null } | null;
  results: { exam_id: string; name: string; percent: number | null; papers: number; absent: number }[] | null;
  homework: { pending: number; overdue: number; done: number; checked: number } | null;
  requests: RequestRow[];
  certificates: { kind: string; serial_no: string; issued_on: string }[] | null;
  tests: { title: string; score: number | null; submitted_at: string | null; needs_marking: boolean }[] | null;
  ptm: PtmRow[] | null;
  siblings: { student_id: string; name: string; class_section: string }[];
}

export interface PersonExtras {
  library: LibrarySummary | null;
  hr: { department: string | null; joined_on: string | null; qualification: string | null; present_days: number; absent_days: number; leave_days: number;
    requests: RequestRow[]; latest_payslip: { month: string; net: number } | null } | null;
  buses: { vehicle_number: string; routes: string[]; helper: string | null }[];
  trips: { route: string; direction: string; status: string; started_at: string; ended_at: string | null }[];
  live_classes: { title: string; starts_at: string; sections: string[] }[];
  lesson_plans_this_week: number;
  covers_ahead: number;
  visitors: { name: string; purpose: string; status: string; on: string | null }[];
  warden_of: string[];
  requests: RequestRow[];
  ptm: PtmRow[];
  student_overview: StudentOverview | null;
}
