"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  AiStatus, AnalyticsReport, Camera, CctvSettings, CctvViewRow, ComplianceDoc, ConsentCoverage, ConsentRow, GatePass, GateSummary, Visitor, Worker, Asset, Book, BookIssue, Hostel, LibrarySettings, LibraryStats, MyHostel, StockItem, StockMove, AppNotification, StoredFile, LeaveBalance, LeaveTypeRow, PayrollRun, StaffDayRow, StaffDetail, StaffLeave, StaffRow, BusRoute, ChildTransport, Rider, SosAlert, Trip, Vehicle, ChatContact, ChatMessage, Conversation, MessageLogRow, MessagingStatus, PtmChildSlots, PtmEvent,
  PtmScheduleRow, Survey, SurveyResults, AttemptResult, CoSheet, LiveClass, MyTest, OnlineTest, Question, TestResults, AccountEntry, AccountsSummary, LedgerHead, Certificate, ChildSyllabus, CoverageRow, Enquiry, EnquirySummary, LessonPlan, PromotionPreview,
  Substitution, SubstitutionDay, SyllabusView, BiometricDevice, BunkRow, CalendarEvent, LeaveRequest, PeriodCard, PeriodRoster, Punch,
  AttendanceOverview, AuditEntry, ChildResults, Exam, ExamDetail, HomeworkDetail, HomeworkItem, HomeworkTarget, MarksSheet,
  MarksSheetRef, MyHomework, Notice, ReportCard, SectionResults, AvailableTeacher, FeeCategory, FeeSummary, InvoiceDetail, InvoiceRow, MyFees, Receipt, Roster,
  SectionCard, SectionReport, StructureMatrix, StudentAttendance, ClassItem, DashboardSummary, ModuleState, Period, RoleRules, School, Student, StudentDetail, StudentOption, Subject,
  Subscription, TeacherInfo, TimetableView, User, UserDetail, MyClass, MyClassDetail, StudentOverview,
} from "@/lib/api/types";

export const qk = {
  school: ["school", "current"] as const,
  modules: ["school", "modules"] as const,
  users: (params: object) => ["users", params] as const,
  audit: (params: object) => ["audit", params] as const,
  schools: (params: object) => ["platform", "schools", params] as const,
  schoolModules: (id: string) => ["platform", "schools", id, "modules"] as const,
};

export function useCurrentSchool() {
  return useQuery({ queryKey: qk.school, queryFn: async () => (await api<School>("/schools/current")).data });
}

export function useModules(enabled = true) {
  return useQuery({ queryKey: qk.modules, enabled, queryFn: async () => (await api<ModuleState[]>("/schools/current/modules")).data });
}

export interface UserListParams {
  page: number;
  page_size?: number;
  search?: string;
  role?: string;
  is_active?: boolean;
}

export function useUsers(params: UserListParams, enabled = true) {
  return useQuery({
    queryKey: qk.users(params),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<User[]>("/users", { query: { page_size: 20, ...params } }),
  });
}

export type AuditRow = AuditEntry & { user_name: string | null };

export function useAudit(params: { page: number; page_size?: number; action?: string }, enabled = true) {
  return useQuery({
    queryKey: qk.audit(params),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<AuditRow[]>("/users/audit-log", { query: { page_size: 25, ...params } }),
  });
}

export function useSchools(params: { page: number; page_size?: number; search?: string; is_active?: boolean }, enabled = true) {
  return useQuery({
    queryKey: qk.schools(params),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<School[]>("/schools", { query: { page_size: 20, ...params } }),
  });
}

export function useSubscription(enabled = true) {
  return useQuery({ queryKey: ["subscription"], enabled, queryFn: async () => (await api<Subscription>("/subscription")).data });
}

export function useDashboardSummary(enabled = true) {
  return useQuery({ queryKey: ["dashboard", "summary"], enabled, queryFn: async () => (await api<DashboardSummary>("/dashboard/summary")).data });
}

export function usePricingCatalog() {
  return useQuery({
    queryKey: ["public", "pricing"],
    staleTime: 10 * 60_000,
    queryFn: async () => (await api<import("@/lib/api/types").PricingCatalog>("/public/pricing")).data,
  });
}

export function useClasses(enabled = true) {
  return useQuery({ queryKey: ["classes"], enabled, queryFn: async () => (await api<ClassItem[]>("/classes")).data });
}

export interface StudentListParams {
  page: number;
  page_size?: number;
  search?: string;
  class_id?: string;
  section_id?: string;
  status?: string;
}

export function useStudents(params: StudentListParams) {
  return useQuery({
    queryKey: ["students", params],
    placeholderData: keepPreviousData,
    queryFn: () => api<Student[]>("/students", { query: { page_size: 25, ...params } }),
  });
}

export function useStudent(id: string) {
  return useQuery({ queryKey: ["student", id], queryFn: async () => (await api<StudentDetail>(`/students/${id}`)).data });
}

export function useStudentOptions(search: string, withoutLogin = false, enabled = true) {
  return useQuery({
    queryKey: ["students", "options", search, withoutLogin],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<StudentOption[]>("/students/options", { query: { search, without_login: withoutLogin } })).data,
  });
}

export function useRoleRules() {
  return useQuery({ queryKey: ["meta", "roles"], staleTime: Infinity, queryFn: async () => (await api<RoleRules>("/meta/roles")).data });
}

export function useUserDetail(id: string | null) {
  return useQuery({ queryKey: ["user", id], enabled: Boolean(id), queryFn: async () => (await api<UserDetail>(`/users/${id}`)).data });
}

// ---- timetable -------------------------------------------------------------------------------

export function useSubjects(enabled = true) {
  return useQuery({ queryKey: ["timetable", "subjects"], enabled, queryFn: async () => (await api<Subject[]>("/timetable/subjects")).data });
}

export function usePeriods() {
  return useQuery({ queryKey: ["timetable", "periods"], queryFn: async () => (await api<Period[]>("/timetable/periods")).data });
}

export function useTimetableTeachers(enabled = true) {
  return useQuery({ queryKey: ["timetable", "teachers"], enabled, queryFn: async () => (await api<TeacherInfo[]>("/timetable/teachers")).data });
}

export function useSectionTimetable(sectionId: string | null) {
  return useQuery({
    queryKey: ["timetable", "section", sectionId],
    enabled: Boolean(sectionId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<TimetableView>(`/timetable/sections/${sectionId}`)).data,
  });
}

export function useTeacherTimetable(teacherId: string | null) {
  return useQuery({
    queryKey: ["timetable", "teacher", teacherId],
    enabled: Boolean(teacherId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<TimetableView>(`/timetable/teachers/${teacherId}`)).data,
  });
}

export function useMyTimetables(enabled = true) {
  return useQuery({ queryKey: ["timetable", "my"], enabled, queryFn: async () => (await api<TimetableView[]>("/timetable/my")).data });
}

export function useAvailableTeachers(params: { day: number; period_id: string; subject_id?: string; section_id?: string } | null) {
  return useQuery({
    queryKey: ["timetable", "available", params],
    enabled: Boolean(params),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<AvailableTeacher[]>("/timetable/available-teachers", { query: params! })).data,
  });
}

// ---- attendance ------------------------------------------------------------------------------

export function useAttendanceSections(date: string | undefined, enabled = true) {
  return useQuery({ queryKey: ["attendance", "sections", date], enabled, queryFn: async () => (await api<SectionCard[]>("/attendance/sections", { query: { date } })).data });
}

export function useRoster(sectionId: string, date: string | undefined) {
  return useQuery({
    queryKey: ["attendance", "roster", sectionId, date],
    queryFn: async () => (await api<Roster>(`/attendance/sections/${sectionId}`, { query: { date } })).data,
  });
}

export function useAttendanceOverview(date: string | undefined, enabled = true) {
  return useQuery({ queryKey: ["attendance", "overview", date], enabled, queryFn: async () => (await api<AttendanceOverview>("/attendance/overview", { query: { date } })).data });
}

export function useSectionReport(sectionId: string | null, month: string) {
  return useQuery({
    queryKey: ["attendance", "report", sectionId, month],
    enabled: Boolean(sectionId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<SectionReport>(`/attendance/sections/${sectionId}/report`, { query: { month } })).data,
  });
}

export function useMyAttendance(month: string, enabled = true) {
  return useQuery({
    queryKey: ["attendance", "my", month],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<StudentAttendance[]>("/attendance/my", { query: { month } })).data,
  });
}

export function useStudentAttendance(studentId: string, month: string, enabled = true) {
  return useQuery({
    queryKey: ["attendance", "student", studentId, month],
    enabled,
    queryFn: async () => (await api<StudentAttendance>(`/attendance/students/${studentId}`, { query: { month } })).data,
  });
}

// ---- fees ------------------------------------------------------------------------------------

export function useFeeSummary(enabled = true) {
  return useQuery({ queryKey: ["fees", "summary"], enabled, queryFn: async () => (await api<FeeSummary>("/fees/summary")).data });
}

export interface InvoiceParams { page: number; status?: string; class_id?: string; term?: string; search?: string; student_id?: string; page_size?: number }

export function useInvoices(params: InvoiceParams, enabled = true) {
  return useQuery({
    queryKey: ["fees", "invoices", params],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<InvoiceRow[]>("/fees/invoices", { query: { page_size: 25, ...params } }),
  });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: ["fees", "invoice", id], queryFn: async () => (await api<InvoiceDetail>(`/fees/invoices/${id}`)).data });
}

export function useFeeTerms() {
  return useQuery({ queryKey: ["fees", "terms"], queryFn: async () => (await api<string[]>("/fees/terms")).data });
}

export function useFeeCategories() {
  return useQuery({ queryKey: ["fees", "categories"], queryFn: async () => (await api<FeeCategory[]>("/fees/categories")).data });
}

export function useFeeStructures() {
  return useQuery({ queryKey: ["fees", "structures"], queryFn: async () => (await api<StructureMatrix>("/fees/structures")).data });
}

export function useReceipt(id: string) {
  return useQuery({ queryKey: ["fees", "receipt", id], queryFn: async () => (await api<Receipt>(`/fees/payments/${id}/receipt`)).data });
}

export function useMyFees(enabled = true) {
  return useQuery({ queryKey: ["fees", "my"], enabled, queryFn: async () => (await api<MyFees>("/fees/my")).data });
}

// ---- exams -----------------------------------------------------------------------------------

export function useExams(enabled = true) {
  return useQuery({ queryKey: ["exams", "list"], enabled, queryFn: async () => (await api<Exam[]>("/exams")).data });
}

export function useExam(id: string) {
  return useQuery({ queryKey: ["exams", "detail", id], queryFn: async () => (await api<ExamDetail>(`/exams/${id}`)).data });
}

export function useMarksSheets(examId: string) {
  return useQuery({ queryKey: ["exams", "sheets", examId], queryFn: async () => (await api<MarksSheetRef[]>(`/exams/${examId}/marks-sheets`)).data });
}

export function useMarksSheet(paperId: string, sectionId: string) {
  return useQuery({
    queryKey: ["exams", "sheet", paperId, sectionId],
    queryFn: async () => (await api<MarksSheet>(`/exams/papers/${paperId}/sections/${sectionId}`)).data,
  });
}

export function useSectionResults(examId: string, sectionId: string | null) {
  return useQuery({
    queryKey: ["exams", "results", examId, sectionId],
    enabled: Boolean(sectionId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<SectionResults>(`/exams/${examId}/results/${sectionId}`)).data,
  });
}

export function useReportCard(examId: string, studentId: string) {
  return useQuery({ queryKey: ["exams", "report", examId, studentId], queryFn: async () => (await api<ReportCard>(`/exams/${examId}/report/${studentId}`)).data });
}

export function useMyResults(enabled = true) {
  return useQuery({ queryKey: ["exams", "my"], enabled, queryFn: async () => (await api<ChildResults[]>("/exams/my")).data });
}

// ---- notices & homework ----------------------------------------------------------------------

export function useNotices(page: number, unread = false, enabled = true) {
  return useQuery({
    queryKey: ["notices", "list", page, unread],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<Notice[]>("/notices", { query: { page, page_size: 20, unread: unread || undefined } }),
  });
}

export function useUnreadNotices(enabled = true) {
  return useQuery({
    queryKey: ["notices", "unread"],
    enabled,
    refetchInterval: 120_000,
    queryFn: async () => (await api<{ count: number }>("/notices/unread-count")).data.count,
  });
}

export function useNoticeSections(enabled = true) {
  return useQuery({ queryKey: ["notices", "sections"], enabled, queryFn: async () => (await api<{ id: string; label: string }[]>("/notices/sections")).data });
}

export function useHomeworkList(page: number, sectionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["homework", "list", page, sectionId],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<HomeworkItem[]>("/homework", { query: { page, page_size: 20, section_id: sectionId } }),
  });
}

export function useHomework(id: string) {
  return useQuery({ queryKey: ["homework", "detail", id], queryFn: async () => (await api<HomeworkDetail>(`/homework/${id}`)).data });
}

export function useHomeworkTargets(enabled = true) {
  return useQuery({ queryKey: ["homework", "targets"], enabled, queryFn: async () => (await api<HomeworkTarget[]>("/homework/targets")).data });
}

export function useMyHomework(enabled = true) {
  return useQuery({ queryKey: ["homework", "my"], enabled, queryFn: async () => (await api<MyHomework[]>("/homework/my")).data });
}

// ---- notification centre & files --------------------------------------------------------------

export function useNotificationCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "count"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => (await api<{ count: number }>("/notifications/unread-count")).data.count,
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "list"],
    enabled,
    queryFn: async () => (await api<AppNotification[]>("/notifications", { query: { page_size: 30 } })).data,
  });
}

export function useFiles(purpose: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ["files", purpose, ownerId],
    enabled: !!ownerId,
    queryFn: async () => (await api<StoredFile[]>("/files", { query: { purpose, owner_id: ownerId } })).data,
  });
}

// ---- syllabus, lesson plans, admissions, certificates, promotion, substitutions --------------

export function useCoverage(enabled = true) {
  return useQuery({ queryKey: ["syllabus", "coverage"], enabled, queryFn: async () => (await api<CoverageRow[]>("/syllabus/coverage")).data });
}

export function useMySyllabus(enabled = true) {
  return useQuery({ queryKey: ["syllabus", "my"], enabled, queryFn: async () => (await api<ChildSyllabus[]>("/syllabus/my")).data });
}

export function useSyllabusSubjects(classId: string | null) {
  return useQuery({
    queryKey: ["syllabus", "subjects", classId],
    enabled: !!classId,
    queryFn: async () => (await api<{ id: string; name: string; color: string; topics: number }[]>(`/syllabus/classes/${classId}/subjects`)).data,
  });
}

export function useSyllabus(classId: string | null, subjectId: string | null) {
  return useQuery({
    queryKey: ["syllabus", "view", classId, subjectId],
    enabled: !!classId && !!subjectId,
    queryFn: async () => (await api<SyllabusView>(`/syllabus/classes/${classId}/subjects/${subjectId}`)).data,
  });
}

export function useLessons(from: string, to: string, sectionId?: string) {
  return useQuery({
    queryKey: ["lessons", from, to, sectionId],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<LessonPlan[]>("/lesson-plans", { query: { from, to, section_id: sectionId } })).data,
  });
}

export function useEnquiries(params: { page: number; status?: string; search?: string; due?: boolean }) {
  return useQuery({
    queryKey: ["enquiries", "list", params],
    placeholderData: keepPreviousData,
    queryFn: () => api<Enquiry[]>("/admissions", { query: { ...params, page_size: 25 } }),
  });
}

export function useEnquirySummary() {
  return useQuery({ queryKey: ["enquiries", "summary"], queryFn: async () => (await api<EnquirySummary>("/admissions/summary")).data });
}

export function useCertificates(studentId?: string) {
  return useQuery({
    queryKey: ["certificates", studentId],
    queryFn: async () => (await api<Certificate[]>("/certificates", { query: { student_id: studentId } })).data,
  });
}

export function usePromotion(sectionId: string | null) {
  return useQuery({
    queryKey: ["promotion", sectionId],
    enabled: !!sectionId,
    queryFn: async () => (await api<PromotionPreview>(`/promotion/${sectionId}`)).data,
  });
}

export function useSubstitutionDay(date: string) {
  return useQuery({ queryKey: ["substitutions", date], queryFn: async () => (await api<SubstitutionDay>("/substitutions", { query: { date } })).data });
}

export function useMyCovers(enabled = true) {
  return useQuery({ queryKey: ["substitutions", "mine"], enabled, queryFn: async () => (await api<Substitution[]>("/substitutions/mine")).data });
}

// ---- calendar, leave, devices, period-wise ------------------------------------------------------

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ["calendar", from, to],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<CalendarEvent[]>("/calendar", { query: { from, to } })).data,
  });
}

export function useLeave(status?: string, enabled = true) {
  return useQuery({ queryKey: ["leave", status], enabled, queryFn: async () => (await api<LeaveRequest[]>("/leave", { query: { status } })).data });
}

export function useDevices() {
  return useQuery({ queryKey: ["devices"], refetchInterval: 30_000, queryFn: async () => (await api<BiometricDevice[]>("/devices")).data });
}

export function usePunches() {
  return useQuery({ queryKey: ["devices", "punches"], refetchInterval: 30_000, queryFn: async () => (await api<Punch[]>("/devices/punches")).data });
}

export function useMyPeriods(date: string, enabled = true) {
  return useQuery({ queryKey: ["periods", date], enabled, queryFn: async () => (await api<PeriodCard[]>("/attendance/periods", { query: { date } })).data });
}

export function usePeriodRoster(entryId: string | null, date: string) {
  return useQuery({
    queryKey: ["periods", "roster", entryId, date],
    enabled: !!entryId,
    queryFn: async () => (await api<PeriodRoster>(`/attendance/periods/${entryId}`, { query: { date } })).data,
  });
}

export function useBunks(date: string, enabled = true) {
  return useQuery({ queryKey: ["periods", "bunks", date], enabled, queryFn: async () => (await api<BunkRow[]>("/attendance/bunks", { query: { date } })).data });
}

// ---- accounts -------------------------------------------------------------------------------------

export function useLedgerHeads() {
  return useQuery({ queryKey: ["accounts", "heads"], queryFn: async () => (await api<LedgerHead[]>("/accounts/heads")).data });
}

export function useAccountEntries(params: { from: string; to: string; page: number; kind?: string; search?: string }) {
  return useQuery({
    queryKey: ["accounts", "entries", params],
    placeholderData: keepPreviousData,
    queryFn: () => api<AccountEntry[]>("/accounts/entries", { query: { ...params, page_size: 25 } }),
  });
}

export function useAccountsSummary(from: string, to: string) {
  return useQuery({
    queryKey: ["accounts", "summary", from, to],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<AccountsSummary>("/accounts/summary", { query: { from, to } })).data,
  });
}

// ---- online tests, co-scholastic, live classes ----------------------------------------------------

export function useQuestions(classId: string | null, subjectId?: string, search?: string) {
  return useQuery({
    queryKey: ["questions", classId, subjectId, search],
    enabled: !!classId,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<Question[]>("/questions", { query: { class_id: classId, subject_id: subjectId, search } })).data,
  });
}

export function useOnlineTests() {
  return useQuery({ queryKey: ["online-tests", "list"], queryFn: async () => (await api<OnlineTest[]>("/online-tests")).data });
}

export function useTestResults(id: string) {
  return useQuery({ queryKey: ["online-tests", "results", id], queryFn: async () => (await api<TestResults>(`/online-tests/${id}/results`)).data });
}

export function useMyTests(enabled = true) {
  return useQuery({ queryKey: ["online-tests", "my"], enabled, queryFn: async () => (await api<MyTest[]>("/online-tests/my")).data });
}

export function useAttemptResult(testId: string, studentId: string | null) {
  return useQuery({
    queryKey: ["online-tests", "result", testId, studentId],
    enabled: !!studentId,
    queryFn: async () => (await api<AttemptResult>(`/online-tests/${testId}/result/${studentId}`)).data,
  });
}

export function useCoSheet(examId: string, sectionId: string) {
  return useQuery({ queryKey: ["co-scholastic", examId, sectionId], queryFn: async () => (await api<CoSheet>(`/co-scholastic/${examId}/${sectionId}`)).data });
}

export function useLiveClasses() {
  return useQuery({ queryKey: ["live-classes"], refetchInterval: 60_000, queryFn: async () => (await api<LiveClass[]>("/live-classes")).data });
}

// ---- messaging, chat, PTM, surveys --------------------------------------------------------------

export function useMessagingStatus() {
  return useQuery({ queryKey: ["messaging", "status"], queryFn: async () => (await api<MessagingStatus>("/messaging/status")).data });
}

export function useMessageLog() {
  return useQuery({ queryKey: ["messaging", "log"], queryFn: async () => (await api<MessageLogRow[]>("/messaging")).data });
}

export function useChatContacts(enabled = true) {
  return useQuery({ queryKey: ["chat", "contacts"], enabled, staleTime: 0, queryFn: async () => (await api<ChatContact[]>("/chat/contacts")).data });
}

export function useConversations() {
  return useQuery({ queryKey: ["chat", "conversations"], refetchInterval: 15_000, queryFn: async () => (await api<Conversation[]>("/chat/conversations")).data });
}

export function useChatMessages(id: string | null) {
  return useQuery({
    queryKey: ["chat", "messages", id],
    enabled: !!id,
    refetchInterval: 8_000,
    queryFn: async () => (await api<ChatMessage[]>(`/chat/conversations/${id}/messages`)).data,
  });
}

export function usePtmEvents() {
  return useQuery({ queryKey: ["ptm", "list"], queryFn: async () => (await api<PtmEvent[]>("/ptm")).data });
}

export function usePtmSlots(id: string | null) {
  return useQuery({ queryKey: ["ptm", "slots", id], enabled: !!id, queryFn: async () => (await api<PtmChildSlots[]>(`/ptm/${id}/slots`)).data });
}

export function usePtmSchedule(id: string | null) {
  return useQuery({ queryKey: ["ptm", "schedule", id], enabled: !!id, queryFn: async () => (await api<PtmScheduleRow[]>(`/ptm/${id}/schedule`)).data });
}

export function useSurveys() {
  return useQuery({ queryKey: ["surveys", "list"], queryFn: async () => (await api<Survey[]>("/surveys")).data });
}

export function useSurveyResults(id: string | null) {
  return useQuery({ queryKey: ["surveys", "results", id], enabled: !!id, queryFn: async () => (await api<SurveyResults>(`/surveys/${id}/results`)).data });
}

// ---- transport ------------------------------------------------------------------------------------

export function useVehicles() {
  return useQuery({ queryKey: ["transport", "vehicles"], queryFn: async () => (await api<Vehicle[]>("/transport/vehicles")).data });
}

export function useBusRoutes() {
  return useQuery({ queryKey: ["transport", "routes"], queryFn: async () => (await api<BusRoute[]>("/transport/routes")).data });
}

export function useRiders(routeId: string | null) {
  return useQuery({ queryKey: ["transport", "riders", routeId], enabled: !!routeId, queryFn: async () => (await api<Rider[]>(`/transport/routes/${routeId}/riders`)).data });
}

export function useLiveTrips() {
  return useQuery({ queryKey: ["transport", "live"], refetchInterval: 10_000, queryFn: async () => (await api<Trip[]>("/transport/live")).data });
}

export function useSosAlerts() {
  return useQuery({ queryKey: ["transport", "sos"], refetchInterval: 20_000, queryFn: async () => (await api<SosAlert[]>("/transport/sos")).data });
}

export function useMyTransport() {
  return useQuery({ queryKey: ["transport", "my"], refetchInterval: 10_000, queryFn: async () => (await api<ChildTransport[]>("/transport/my")).data });
}

// ---- HR and payroll -------------------------------------------------------------------------------

export function useStaffDirectory() {
  return useQuery({ queryKey: ["hr", "staff"], queryFn: async () => (await api<StaffRow[]>("/hr/staff")).data });
}

export function useStaffDetail(id: string | null) {
  return useQuery({ queryKey: ["hr", "staff", id], enabled: !!id, queryFn: async () => (await api<StaffDetail>(`/hr/staff/${id}`)).data });
}

export function useStaffDay(date: string) {
  return useQuery({ queryKey: ["hr", "attendance", date], queryFn: async () => (await api<StaffDayRow[]>("/hr/attendance", { query: { date } })).data });
}

export function useLeaveTypes() {
  return useQuery({ queryKey: ["hr", "leave-types"], queryFn: async () => (await api<LeaveTypeRow[]>("/hr/leave-types")).data });
}

export function useStaffLeave(mine: boolean, status?: string) {
  return useQuery({ queryKey: ["hr", "leave", mine, status], queryFn: async () => (await api<StaffLeave[]>("/hr/leave", { query: { mine, status } })).data });
}

export function useMyLeaveBalance() {
  return useQuery({ queryKey: ["hr", "balance"], queryFn: async () => (await api<LeaveBalance[]>("/hr/my/leave-balance")).data });
}

export function usePayrollRuns() {
  return useQuery({ queryKey: ["hr", "payroll"], queryFn: async () => (await api<PayrollRun[]>("/hr/payroll")).data });
}

export function usePayrollRun(id: string) {
  return useQuery({ queryKey: ["hr", "payroll", id], queryFn: async () => (await api<PayrollRun>(`/hr/payroll/${id}`)).data });
}

export function useMyPayslips() {
  return useQuery({ queryKey: ["hr", "my-payslips"], queryFn: async () => (await api<{ id: string; month: string; net: number; gross: number; status: string; paid_on: string | null }[]>("/hr/my/payslips")).data });
}

// ---- library, hostel, inventory -----------------------------------------------------------------

export function useLibraryStats() {
  return useQuery({ queryKey: ["library", "stats"], queryFn: async () => (await api<LibraryStats>("/library/stats")).data });
}

export function useLibrarySettings() {
  return useQuery({ queryKey: ["library", "settings"], queryFn: async () => (await api<LibrarySettings>("/library/settings")).data });
}

export function useBooks(q: string, category?: string) {
  return useQuery({ queryKey: ["library", "books", q, category], placeholderData: keepPreviousData, queryFn: async () => (await api<Book[]>("/library/books", { query: { q: q || undefined, category } })).data });
}

export function useBook(id: string | null) {
  return useQuery({ queryKey: ["library", "book", id], enabled: !!id, queryFn: async () => (await api<Book>(`/library/books/${id}`)).data });
}

export function useBookIssues(status: string) {
  return useQuery({ queryKey: ["library", "issues", status], queryFn: async () => (await api<BookIssue[]>("/library/issues", { query: { status } })).data });
}

export function useMyBooks() {
  return useQuery({ queryKey: ["library", "mine"], queryFn: async () => (await api<BookIssue[]>("/library/mine")).data });
}

export function useHostels() {
  return useQuery({ queryKey: ["hostels"], queryFn: async () => (await api<Hostel[]>("/hostels")).data });
}

export function useHostel(id: string | null) {
  return useQuery({ queryKey: ["hostels", id], enabled: !!id, queryFn: async () => (await api<Hostel>(`/hostels/${id}`)).data });
}

export function useMyHostel() {
  return useQuery({ queryKey: ["hostels", "mine"], queryFn: async () => (await api<MyHostel[]>("/hostels/mine")).data });
}

export function useStockItems(low = false) {
  return useQuery({ queryKey: ["inventory", "items", low], queryFn: async () => (await api<StockItem[]>("/inventory/items", { query: { low } })).data });
}

export function useStockMoves(id: string | null) {
  return useQuery({ queryKey: ["inventory", "moves", id], enabled: !!id, queryFn: async () => (await api<StockMove[]>(`/inventory/items/${id}/moves`)).data });
}

export function useAssets(q: string, condition?: string) {
  return useQuery({ queryKey: ["inventory", "assets", q, condition], placeholderData: keepPreviousData, queryFn: async () => (await api<Asset[]>("/inventory/assets", { query: { q: q || undefined, condition } })).data });
}

// ---- gate and security --------------------------------------------------------------------------

export function useGateSummary() {
  return useQuery({ queryKey: ["gate", "summary"], refetchInterval: 30_000, queryFn: async () => (await api<GateSummary>("/gate/summary")).data });
}

export function useVisitors(date: string | null, status?: string, mine = false) {
  return useQuery({ queryKey: ["gate", "visitors", date, status, mine], refetchInterval: 30_000, queryFn: async () => (await api<Visitor[]>("/gate/visitors", { query: { date: date ?? undefined, status, mine: mine || undefined } })).data });
}

export function useGatePasses(date: string | null, status?: string) {
  return useQuery({ queryKey: ["gate", "passes", date, status], refetchInterval: 30_000, queryFn: async () => (await api<GatePass[]>("/gate/passes", { query: { date: date ?? undefined, status } })).data });
}

export function useWorkers(q: string) {
  return useQuery({ queryKey: ["gate", "workers", q], placeholderData: keepPreviousData, queryFn: async () => (await api<Worker[]>("/gate/workers", { query: { q: q || undefined } })).data });
}

export function useComplianceDocs() {
  return useQuery({ queryKey: ["compliance"], queryFn: async () => (await api<ComplianceDoc[]>("/compliance")).data });
}

export function useCctvSettings() {
  return useQuery({ queryKey: ["cctv", "settings"], queryFn: async () => (await api<CctvSettings>("/cctv/settings")).data });
}

export function useCameras() {
  return useQuery({ queryKey: ["cctv", "cameras"], queryFn: async () => (await api<Camera[]>("/cctv/cameras")).data });
}

export function useMyConsent() {
  return useQuery({ queryKey: ["cctv", "consent"], queryFn: async () => (await api<ConsentRow[]>("/cctv/consent")).data });
}

export function useConsentCoverage() {
  return useQuery({ queryKey: ["cctv", "coverage"], queryFn: async () => (await api<ConsentCoverage[]>("/cctv/coverage")).data });
}

export function useCctvViews() {
  return useQuery({ queryKey: ["cctv", "views"], queryFn: async () => (await api<CctvViewRow[]>("/cctv/views")).data });
}

export function useGateHosts(enabled = true) {
  return useQuery({ queryKey: ["gate", "hosts"], enabled, staleTime: 300_000, queryFn: async () => (await api<{ user_id: string; full_name: string; designation: string | null }[]>("/gate/hosts")).data });
}

// ---- analytics -----------------------------------------------------------------------------------

export function useAnalytics(from?: string, to?: string) {
  return useQuery({ queryKey: ["analytics", from, to], placeholderData: keepPreviousData, queryFn: async () => (await api<AnalyticsReport>("/analytics", { query: { from, to } })).data });
}

export function useAiStatus() {
  return useQuery({ queryKey: ["ai"], queryFn: async () => (await api<AiStatus>("/ai")).data });
}

export function useMyClasses() {
  return useQuery({ queryKey: ["classes", "my"], queryFn: async () => (await api<MyClass[]>("/classes/my")).data });
}

export function useMyClass(sectionId: string | null) {
  return useQuery({ queryKey: ["classes", "my", sectionId], enabled: Boolean(sectionId), queryFn: async () => (await api<MyClassDetail>(`/classes/my/${sectionId}`)).data });
}

/** Everything about a student from the other modules (library, bus, hostel, results, homework, requests...). */
export function useStudentOverview(id: string) {
  return useQuery({ queryKey: ["student", id, "overview"], queryFn: async () => (await api<StudentOverview>(`/students/${id}/overview`)).data });
}

/** The signed-in person's own profile, with everything connected to them. */
export function useMyOverview() {
  return useQuery({ queryKey: ["me", "overview"], queryFn: async () => (await api<UserDetail>("/users/me/overview")).data });
}
