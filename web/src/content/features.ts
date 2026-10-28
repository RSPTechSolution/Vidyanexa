/* Content for the feature pages under /features. Each page targets one search intent (e.g. "school fee management
   software") with genuine detail about what Vidyanexa does, an FAQ, and links to related features. */

export interface Feature {
  slug: string;
  name: string; // short name, used in navigation and breadcrumbs
  metaTitle: string; // <title>, about 50-60 characters with the main keyword first
  description: string; // meta description, about 150-160 characters
  keywords: string[];
  h1: string;
  lead: string; // the paragraph under the H1
  highlights: { title: string; text: string }[];
  roles: { role: string; text: string }[];
  steps?: string[];
  faqs: { q: string; a: string }[];
  related: string[];
  /** Still being built (the module is in preview): kept here, but not published on the website. */
  preview?: boolean;
}

const ALL_FEATURES: Feature[] = [
  {
    slug: "attendance-management-system",
    name: "Attendance management",
    metaTitle: "School Attendance Management System: Biometric & QR",
    description: "Mark class and period attendance in seconds, scan QR ID cards or connect biometric machines, and alert parents of absences by SMS, WhatsApp and app.",
    keywords: ["school attendance management system", "student attendance software", "biometric attendance for schools", "QR code attendance", "period wise attendance", "attendance app for teachers"],
    h1: "Student attendance, marked in seconds and shared with parents instantly",
    lead: "Vidyanexa gives teachers a one-tap register on the web and in the staff app, adds QR card and biometric attendance at the gate, and tells parents the same morning when a child is absent. Principals see every class, every day, without chasing registers.",
    highlights: [
      { title: "One-tap class register", text: "Everyone starts as present; teachers tap only the absentees, late comers, half days and leave. A class of 40 takes under a minute." },
      { title: "Period-wise attendance", text: "Subject teachers mark each period, so students who skip classes after the morning roll call show up in a report." },
      { title: "QR ID card scanning", text: "Print ID cards with a QR code from Vidyanexa and scan them at the gate or classroom with any phone camera." },
      { title: "Biometric machines", text: "Connect ZKTeco-compatible fingerprint and face devices (ADMS). Punches arrive automatically for students and staff." },
      { title: "Instant absence alerts", text: "Parents get an app notification, and optionally SMS or WhatsApp, as soon as attendance is saved." },
      { title: "Leave and holidays built in", text: "Parents apply for leave in the app; class teachers approve it. Holidays and Sundays are excluded from percentages automatically." },
    ],
    roles: [
      { role: "Teachers", text: "Mark attendance from the phone in class, correct the last three days, and see who is below 75%." },
      { role: "Principals", text: "A live school overview: classes marked, present today, a 14-day trend and students with low attendance." },
      { role: "Parents", text: "A monthly calendar for each child, the attendance percentage, and a notification the moment a child is marked absent." },
    ],
    steps: ["Set up classes, sections and class teachers", "Teachers mark attendance on the web or the staff app", "Parents are alerted and the school dashboard updates instantly"],
    faqs: [
      { q: "Can teachers mark attendance on their phone?", a: "Yes. The Vidyanexa Staff app (Android and iOS) and the website both let teachers mark attendance for their own classes and sections." },
      { q: "Does Vidyanexa work with biometric attendance machines?", a: "Yes. Biometric and face devices that support the ADMS push protocol (most ZKTeco models) can send punches straight to Vidyanexa for students and staff." },
      { q: "How are parents told about absences?", a: "Parents receive a notification in the Vidyanexa parent app as soon as attendance is saved. The school can also turn on SMS and WhatsApp alerts for absences." },
      { q: "Can we export attendance reports?", a: "Yes. Monthly attendance reports per class can be viewed on screen and downloaded as CSV for Excel." },
    ],
    related: ["parent-teacher-communication-app", "school-visitor-gate-pass-management", "school-hr-payroll-software"],
  },
  {
    slug: "school-fee-management-software",
    name: "Fee management",
    metaTitle: "School Fee Management Software & Receipts",
    description: "Set fee structures, generate invoices, record cash, UPI, cheque and bank payments, print receipts, send reminders, add late fees and export to Tally for Indian schools.",
    keywords: ["school fee management software", "fee collection software for schools", "school fee dues for parents", "fee receipt software", "school fee reminder", "school accounting Tally export"],
    h1: "School fee management: from fee structure to receipt to Tally",
    lead: "Define fees once per class and term, generate every invoice in one click, and record every payment at the counter. Vidyanexa prints numbered receipts, reminds parents before and after the due date, adds late fees by your rules and keeps the accounts ready for your accountant.",
    highlights: [
      { title: "Fee structures per class and term", text: "Tuition, transport, lab, activity and any other head, with amounts per class. Concessions with a recorded reason." },
      { title: "Counter collection with receipts", text: "Cash, UPI, cheque, card and bank transfer, each with a numbered PDF receipt that can be printed or sent to parents." },
      { title: "Dues and receipts for parents", text: "Parents see what is due for every child in the app and website, with every payment and receipt in one place." },
      { title: "Reminders and late fees", text: "Automatic reminders by app, email, SMS or WhatsApp, and late fees after the grace period you set." },
      { title: "Collections dashboard", text: "Today's collection, the month so far, overdue amounts by age and the largest dues at a glance." },
      { title: "Accounts and Tally export", text: "Record income and expenses with vouchers, see a day book and export to Tally for your auditor." },
    ],
    roles: [
      { role: "Accountants", text: "Search a student, collect, print the receipt and move on, with every rupee traceable." },
      { role: "Principals and owners", text: "See collection against target, overdue fees and income versus expense every month." },
      { role: "Parents", text: "Dues for all children, payment history and downloadable receipts on the phone." },
    ],
    faqs: [
      { q: "Can parents pay school fees online through Vidyanexa?", a: "No. Parents pay the school directly, by cash, UPI, cheque or bank transfer, and the office records it. Parents see their dues, every payment and the receipts in the app. Keeping money out of the app keeps it simple and secure." },
      { q: "Does Vidyanexa support sibling and staff-ward concessions?", a: "Yes. Any invoice can carry a concession with a reason, such as a sibling concession or a staff-ward waiver, and it shows on the receipt." },
      { q: "Can we send fee reminders by WhatsApp?", a: "Yes. Fee reminders can go out by app notification and email, and by SMS and WhatsApp once those are switched on for your school." },
      { q: "Can our accountant use Tally?", a: "Yes. Vidyanexa exports vouchers to Tally XML and the day book to CSV." },
    ],
    related: ["school-admission-management", "school-hr-payroll-software", "parent-teacher-communication-app"],
  },
  {
    slug: "online-exam-report-card-software",
    name: "Exams & report cards",
    metaTitle: "Exam & Report Card Software for CBSE Schools",
    description: "Plan exams and date sheets, enter marks with CBSE grading, run online MCQ tests, add co-scholastic grades and publish printable report cards to parents.",
    keywords: ["report card software", "exam management system for schools", "CBSE report card generator", "online test software for schools", "marks entry software", "co-scholastic grades"],
    h1: "Exams, marks and report cards without a single spreadsheet",
    lead: "Plan exams and date sheets, let each teacher enter marks only for the subjects they teach, and publish results with grades, ranks and remarks. Report cards print in your school's format and reach parents in the app the moment you publish.",
    highlights: [
      { title: "Exams and date sheets", text: "Unit tests, half-yearly and annual exams, with date sheets built class by class or straight from the timetable." },
      { title: "Teacher marks entry", text: "Teachers see only their own subjects and classes, with range checks and CBSE grades (A1 to E) shown as they type." },
      { title: "Report cards and ranks", text: "Totals, percentages, grades, ranks and class teacher remarks on a printable PDF report card." },
      { title: "Co-scholastic grades", text: "Grades for work education, art, health and discipline alongside the academic marks." },
      { title: "Online tests", text: "A question bank and timed MCQ tests that grade themselves, for practice or assessment." },
      { title: "Publish to parents", text: "Publishing locks the marks and shows the report card in the parent app; unpublish to make corrections." },
    ],
    roles: [
      { role: "Teachers", text: "Enter marks from any device, see class averages and pass rates, and add remarks." },
      { role: "Exam coordinators", text: "Plan the whole exam in one place and know exactly which papers are still pending." },
      { role: "Parents and students", text: "Results and report cards in the app, with subject-wise marks and the trend across exams." },
    ],
    faqs: [
      { q: "Does Vidyanexa follow CBSE grading?", a: "Yes. Marks are converted to CBSE grades from A1 to E automatically, and report cards include co-scholastic areas." },
      { q: "Can teachers only edit their own subjects?", a: "Yes. A teacher can enter marks only for the subjects and sections they teach. Admins can see and correct everything." },
      { q: "Can we conduct online tests?", a: "Yes. Build a question bank, set a timed test for chosen classes, and students attempt it in the app or browser. Objective questions are marked instantly." },
      { q: "Can parents download report cards?", a: "Yes. Once results are published, parents and students can view and download the report card PDF." },
    ],
    related: ["attendance-management-system", "parent-teacher-communication-app", "school-admission-management"],
  },
  {
    slug: "school-bus-gps-tracking",
    name: "Transport & bus tracking",
    metaTitle: "School Bus GPS Tracking App & Transport Management",
    description: "Track school buses live with the driver app, alert parents when children board and get off, and manage routes, stops, vehicles, transport fees and SOS.",
    keywords: ["school bus tracking app", "school bus GPS tracking", "school transport management system", "bus route management", "student boarding alerts", "driver app for school bus"],
    h1: "Live school bus tracking that parents can actually rely on",
    lead: "The driver starts the trip in the Vidyanexa Driver app, and the bus appears live on the map for the transport office and for each family on that route. Parents are told when their child boards and gets off, and an SOS button reaches the school instantly.",
    highlights: [
      { title: "Live GPS from the driver's phone", text: "No extra hardware needed: the driver app shares the bus location every few seconds while a trip runs." },
      { title: "Boarding and drop alerts", text: "The driver or helper marks each student on and off the bus, and parents get a notification right away." },
      { title: "Routes and stops", text: "Routes with ordered stops, pickup and drop times, the vehicle and the driver, plus per-route transport fees." },
      { title: "Fleet records", text: "Vehicles with capacity and helper details, and reminders before insurance, fitness and permits expire." },
      { title: "SOS", text: "One tap in the driver app alerts the transport manager and admins with the bus's location." },
      { title: "Parent bus view", text: "Families see their child's route, stop and the bus moving on a map, so nobody waits at the stop for long." },
    ],
    roles: [
      { role: "Transport managers", text: "Every bus on one map, with on-board counts and alerts for stale GPS or SOS." },
      { role: "Drivers", text: "A simple app: choose the route, start the trip, tick students on and off." },
      { role: "Parents", text: "Know where the bus is and when your child boarded or got off." },
    ],
    faqs: [
      { q: "Do we need GPS devices in buses?", a: "No. The Vidyanexa Driver app uses the driver's phone GPS. Any Android or iOS phone with mobile data works." },
      { q: "Will parents be notified when a child boards the bus?", a: "Yes. When the driver or helper marks a student on or off, the parents get a notification, and optionally an SMS or WhatsApp message." },
      { q: "Can transport fees be linked to routes?", a: "Yes. Each route can carry a monthly fee, which is added to the student's fee invoices." },
      { q: "Is there an emergency button?", a: "Yes. The driver app has an SOS button that alerts the transport manager and school admins with the bus's location." },
    ],
    related: ["parent-teacher-communication-app", "school-fee-management-software", "school-visitor-gate-pass-management"],
  },
  {
    slug: "school-hr-payroll-software",
    name: "HR & payroll",
    metaTitle: "School HR & Payroll Software with PF, ESI & Payslips",
    description: "Staff records, staff attendance, leave approvals and monthly payroll with PF, ESI, professional tax and TDS. Payslips as PDF and staff self-service in the app.",
    keywords: ["school payroll software", "HR software for schools", "staff attendance and leave management", "teacher salary slip software", "PF ESI payroll India", "school staff management"],
    h1: "HR and payroll for schools, with PF, ESI and payslips done for you",
    lead: "Keep every teacher's and staff member's records in one place, track staff attendance and leave, and run monthly payroll that accounts for loss of pay, PF, ESI, professional tax and TDS. Staff download their own payslips from the app.",
    highlights: [
      { title: "Staff directory and profiles", text: "Designation, department, joining date, PAN, UAN, bank details and salary structure for each staff member." },
      { title: "Staff attendance", text: "Daily attendance marked by HR or captured from biometric machines, with check-in and check-out times." },
      { title: "Leave management", text: "Leave types and yearly balances; staff apply in the app and HR approves." },
      { title: "Monthly payroll", text: "Paid days, loss of pay, earnings, PF, ESI, professional tax and TDS calculated for every staff member in one run." },
      { title: "Payslips", text: "Professional PDF payslips, with adjustments such as bonus or advance recovery before you finalise." },
      { title: "Staff self-service", text: "Teachers see their leave balance, apply for leave and download payslips in the Vidyanexa Staff app." },
    ],
    roles: [
      { role: "HR managers", text: "Attendance, leave and profiles in one place, with no month-end scramble." },
      { role: "Accountants", text: "Payroll in minutes, with statutory deductions calculated and the bank-ready list prepared." },
      { role: "Teachers and staff", text: "Leave balance, leave requests and payslips on the phone." },
    ],
    faqs: [
      { q: "Does the payroll calculate PF and ESI?", a: "Yes. PF is calculated on basic plus DA (with the wage ceiling), ESI applies to eligible gross salaries, and professional tax and TDS are deducted as configured for each staff member." },
      { q: "Is leave without pay deducted automatically?", a: "Yes. Absences and approved leave without pay reduce paid days, and the salary is prorated." },
      { q: "Can staff download their payslips?", a: "Yes. Once payroll is finalised, every staff member can view and download their payslip PDF in the app or on the website." },
      { q: "Can we use biometric staff attendance?", a: "Yes. Punches from connected biometric devices count towards staff attendance automatically." },
    ],
    related: ["attendance-management-system", "school-fee-management-software", "school-visitor-gate-pass-management"],
  },
  {
    slug: "parent-teacher-communication-app",
    name: "Parent communication",
    metaTitle: "Parent Teacher Communication App for Schools",
    description: "Notices, homework, teacher chat, PTM booking and alerts by app, SMS, WhatsApp and email. One parent app for every child's attendance, fees and results.",
    keywords: ["parent teacher communication app", "school app for parents", "school notice app", "school WhatsApp messaging", "homework app for schools", "PTM booking"],
    h1: "One app that keeps every parent informed, without WhatsApp group chaos",
    lead: "Vidyanexa replaces scattered WhatsApp groups with an official channel: notices with read receipts, homework, private chat with teachers, parent-teacher meeting booking and surveys. Important alerts can also go out by SMS, WhatsApp and email.",
    highlights: [
      { title: "Notices with read receipts", text: "Post to the whole school, staff, parents or chosen classes, pin urgent notices, and see who has read them." },
      { title: "Homework", text: "Teachers set homework with attachments and due dates; families tick it off and teachers check it." },
      { title: "Private parent-teacher chat", text: "Parents message their child's teachers directly in the app, without sharing personal phone numbers." },
      { title: "PTM booking", text: "Schools open time slots and parents book a meeting with the class teacher, so no one waits in a queue." },
      { title: "SMS, WhatsApp and email", text: "Choose which events also reach parents by SMS or WhatsApp: absences, fees, urgent notices, bus boarding and more." },
      { title: "Surveys and feedback", text: "Collect parent feedback with simple surveys and see the results instantly." },
    ],
    roles: [
      { role: "Teachers", text: "Reach the parents of their own classes only, and keep their personal number private." },
      { role: "School office", text: "Send official notices and know who has read them." },
      { role: "Parents", text: "One app for all children: attendance, homework, fees, results, the bus and messages." },
    ],
    faqs: [
      { q: "Is there a mobile app for parents?", a: "Yes. The Vidyanexa parent app runs on Android and iOS and covers attendance, homework, fees, results, notices, messages, the school bus and more." },
      { q: "Can schools send WhatsApp messages?", a: "Yes. With WhatsApp switched on for your school, selected events such as absences, fee reminders and urgent notices also go out on WhatsApp." },
      { q: "Do teachers need to share their phone numbers?", a: "No. Parents and teachers chat inside the app, so personal numbers stay private." },
      { q: "Can parents book parent-teacher meetings?", a: "Yes. The school opens PTM slots and parents pick a time with the class teacher in the app." },
    ],
    related: ["attendance-management-system", "online-exam-report-card-software", "school-bus-gps-tracking"],
  },
  {
    slug: "school-admission-management",
    name: "Admissions & students",
    metaTitle: "School Admission Management & Student Records",
    description: "Capture admission enquiries online, follow up, admit students with documents, issue TCs and certificates, print QR ID cards and promote classes at year end.",
    keywords: ["school admission management software", "student information system", "online admission form for school", "transfer certificate software", "student ID card generator", "school enquiry management"],
    h1: "Admissions and student records, from first enquiry to transfer certificate",
    lead: "Parents enquire through your school's online admission form, your front office follows up and converts enquiries, and every admitted student gets a complete digital record with documents, guardians and history. Certificates, ID cards and year-end promotion take minutes.",
    highlights: [
      { title: "Online admission enquiry form", text: "A public enquiry page for your school; every enquiry lands in a follow-up list with its source and status." },
      { title: "Student profiles", text: "Personal details, guardians, documents, photos, medical notes and the full record of attendance, fees and results." },
      { title: "Bulk import", text: "Bring existing students and parents in from Excel or CSV, with parent logins created automatically." },
      { title: "Certificates", text: "Transfer, bonafide and character certificates as PDFs, numbered and stored." },
      { title: "ID cards with QR codes", text: "Print student ID cards with photo and QR code, ready for QR attendance at the gate." },
      { title: "Year-end promotion", text: "Move whole classes to the next class, mark pass-outs as alumni and keep their history." },
    ],
    roles: [
      { role: "Front office", text: "Every enquiry tracked to a decision, with follow-up dates." },
      { role: "Admins", text: "One accurate record for every student, with documents in one place." },
      { role: "Parents", text: "A simple online form, and a parent login from day one." },
    ],
    faqs: [
      { q: "Can parents fill an admission form online?", a: "Yes. Each school gets a public enquiry page that parents can open from your website or a shared link." },
      { q: "Can we import our existing student data?", a: "Yes. Upload a CSV or Excel file of students and guardians; Vidyanexa checks it and creates the records and parent accounts." },
      { q: "Can Vidyanexa generate transfer certificates?", a: "Yes. Transfer, bonafide and character certificates are generated as numbered PDFs from the student's record." },
      { q: "Does it print student ID cards?", a: "Yes. ID cards with the student photo and a QR code can be printed for a class or the whole school." },
    ],
    related: ["school-fee-management-software", "attendance-management-system", "online-exam-report-card-software"],
  },
  {
    slug: "school-library-management-system",
    name: "Library management",
    metaTitle: "School Library Management System Software",
    description: "Catalogue books with accession numbers, issue and return in seconds, set loan limits, charge late fines and remind borrowers. Families see books in the app.",
    keywords: ["school library management system", "library software for schools", "book issue and return software", "library fine management", "accession register software"],
    h1: "A school library that runs itself: catalogue, issue, return and fines",
    lead: "Every copy gets an accession number, issue and return take seconds, and Vidyanexa enforces loan periods and borrowing limits for students and staff. Overdue reminders and late fines are automatic, and families see their borrowed books in the app.",
    highlights: [
      { title: "Catalogue with accession numbers", text: "Titles with author, ISBN, publisher, category and rack, and every copy numbered automatically." },
      { title: "Fast issue and return", text: "Type or scan the accession number and the student's admission number. Damaged or lost copies are recorded on return." },
      { title: "Loan rules", text: "Loan period, fine per day, and separate borrowing limits for students and staff." },
      { title: "Overdue reminders and fines", text: "Remind every overdue borrower in one click and track fines due and paid." },
      { title: "Library dashboard", text: "Titles, copies, books issued now, overdue count and fines outstanding." },
      { title: "Borrowers' view", text: "Students, parents and staff see their borrowed books and due dates in the app." },
    ],
    roles: [
      { role: "Librarians", text: "A clean accession register and circulation desk without paper." },
      { role: "Teachers", text: "Search the catalogue and borrow books with their staff account." },
      { role: "Parents", text: "Know which books your child has and when they are due back." },
    ],
    faqs: [
      { q: "Can staff borrow books too?", a: "Yes. Staff borrow with their email or employee ID, with their own borrowing limit." },
      { q: "How are late fines calculated?", a: "Fines are charged per day after the due date at the rate you set, and can be marked paid when collected." },
      { q: "Can parents see library books?", a: "Yes. Parents see their children's borrowed books and due dates in the app." },
    ],
    related: ["school-visitor-gate-pass-management", "school-admission-management", "parent-teacher-communication-app"],
  },
  {
    slug: "hostel-management-software",
    preview: true,
    name: "Hostel management",
    metaTitle: "Hostel Management Software for Boarding Schools",
    description: "Manage hostels, rooms and beds, allocate and move boarders, assign wardens and track occupancy. Parents see their child's hostel, room and warden in the app.",
    keywords: ["hostel management software", "boarding school management", "hostel room allocation", "school hostel software", "warden management"],
    h1: "Hostel management for boarding schools: rooms, beds and wardens",
    lead: "Set up each hostel with its rooms and beds, allocate students in a few clicks and see occupancy at a glance. Vidyanexa checks gender and capacity rules, keeps a history of moves, and shows families their child's room and warden.",
    highlights: [
      { title: "Hostels and wardens", text: "Boys', girls' or mixed hostels, each with a warden, monthly fee and address." },
      { title: "Rooms and beds", text: "Rooms by floor with bed capacity, and free beds visible instantly." },
      { title: "Allocation rules", text: "Allocation respects the hostel's gender and each room's capacity; moving a student closes the old bed." },
      { title: "Occupancy at a glance", text: "Beds taken and free for every hostel and room." },
      { title: "Family view", text: "Parents see the hostel, room, floor and warden's contact in the app." },
    ],
    roles: [
      { role: "Wardens and admins", text: "Know who is in which room, and where there is space." },
      { role: "Parents", text: "Hostel and warden details for each child in the app." },
    ],
    faqs: [
      { q: "Can we move a student to another room?", a: "Yes. Allocating a new room closes the old bed automatically and keeps the history." },
      { q: "Does it prevent overbooking rooms?", a: "Yes. A room cannot take more students than its bed capacity." },
      { q: "Can hostel fees be charged?", a: "Yes. Each hostel has a monthly fee that can be included in fee invoices." },
    ],
    related: ["school-library-management-system", "school-visitor-gate-pass-management", "school-fee-management-software"],
  },
  {
    slug: "school-visitor-gate-pass-management",
    name: "Gate & visitor management",
    metaTitle: "School Visitor Management & Gate Pass System",
    description: "Log visitors at the gate, issue early-pickup gate passes with a code, keep a police-verified workers register and a compliance vault.",
    keywords: ["school visitor management system", "school gate pass system", "student early pickup", "school security software", "visitor log book app", "school compliance documents"],
    h1: "Campus safety: visitor log, gate passes and verified workers",
    lead: "Know who is on campus at any moment. Guards check visitors in and out, parents request early pickups that the class teacher approves, and the person collecting shows a 6-digit code at the gate. The school keeps police-verified contract workers and compliance documents in one place.",
    highlights: [
      { title: "Visitor log", text: "Check-in with purpose, host, ID shown and badge, and check-out. Returning visitors fill in from their phone number." },
      { title: "Early-pickup gate passes", text: "Parents request, the class teacher approves, and the guard verifies a one-time code before the child leaves. Parents are told when the child leaves." },
      { title: "Expected visitors", text: "Staff register guests in advance and are notified when they arrive." },
      { title: "Workers register", text: "Contract workers can enter only with police verification recorded, and every entry and exit is logged." },
      { title: "Compliance vault", text: "Fire NOC, building safety, affiliation and other certificates with scans, expiry dates and reminders." },
    ],
    roles: [
      { role: "Security guards", text: "A simple gate desk: check visitors in and out, and verify pickup codes." },
      { role: "Principals", text: "Who is on campus right now, and which compliance documents are due for renewal." },
      { role: "Parents", text: "Request an early pickup and know the moment your child leaves school." },
    ],
    faqs: [
      { q: "How does an early-pickup gate pass work?", a: "The parent requests it in the app, the class teacher approves it, and the parent receives a 6-digit code. The guard checks the code and the person's ID, and the parent is notified when the child leaves." },
      { q: "Can we stop unverified workers from entering?", a: "Yes. Contract workers without recorded police verification, or whose pass has expired, cannot be checked in." },
      { q: "Will we be reminded before certificates expire?", a: "Yes. The compliance vault reminds admins 30 days before any document expires." },
    ],
    related: ["attendance-management-system", "school-bus-gps-tracking", "parent-teacher-communication-app"],
  },
];

/** The features published on the website. */
export const FEATURES = ALL_FEATURES.filter((f) => !f.preview);

export const featureBySlug = (slug: string) => FEATURES.find((f) => f.slug === slug);
