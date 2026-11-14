# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The website and school dashboard are the web surfaces. The parent/student, staff and driver apps are Flutter apps for Android (live) and iPhone (set up, not yet on TestFlight). They share one Material design on both systems, so they are not platform-adaptive.

## Users

- **Buyer: the school owner.** Decides to buy, pays the subscription, and wants a school that runs smoothly and looks professional to parents.
- **Daily users: the school admin and the office.** Run the school in the web dashboard: students, admissions, fees and receipts, timetables, certificates, staff, settings. Accountants, receptionists, librarians, HR, transport and security staff use the parts their role needs.
- **Daily users: teachers.** Take attendance (only the class teacher, the "incharge", marks a class's attendance), set and check homework, enter marks, write notices and messages, mostly in the staff app.
- **Parents (and older students).** Use the parent app to follow their child: attendance, homework, fees and dues, results, notices, timetable, the school bus, leave requests. Many are not confident with technology.
- **Drivers.** Use the driver app to run a bus trip, mark students on and off, and share the bus's location.
- **The platform admin (Vidyanexa itself).** Manages schools, plans, leads and the platform's health.

## Product Purpose

Vidyanexa runs a whole school in one system: the office's daily work, the teachers' classroom routine, and what parents need to know about their child. It replaces registers, spreadsheets and scattered WhatsApp groups. Success is a school that keeps using it every day after the trial, office staff who manage without help, and parents who check the app instead of calling the school.

## Positioning

For small and mid-sized private schools in India (CBSE, ICSE and state boards, roughly 200 to 2,000 students, often in tier-2 and tier-3 cities) moving off paper and spreadsheets:

- **Everything in one place:** fees, attendance, exams, timetables, transport, library, hostel, HR, communication and the three apps, without add-ons.
- **Simple to use:** office staff and parents with little computer experience manage on day one.
- **Fair, open pricing:** clear plans (Basic, Pro, Max) or a custom plan, a free trial, and online payment for the subscription.
- **Safe and trustworthy:** each school's data is isolated inside the database, with an audit trail and daily backups.

## Operating Context

- A school signs up for a free trial, imports students and staff from spreadsheets (any CSV, columns mapped on screen), and goes live: staff on the web, parents and drivers in the apps.
- The office works at a desk on the web dashboard during school hours; teachers work between periods on their phones; parents check the app in the evening; drivers use the app on the bus at pickup and drop.
- Indian school conventions: classes and sections ("Class 5 – A"), the class teacher (incharge), terms and quarters, fee invoices and receipts in rupees, transfer, bonafide and character certificates, the academic year from April.
- When the trial ends or a plan lapses (after a 7-day grace period), the school is paused: only sign-in and Plan & billing work until it pays.

## Capabilities and Constraints

- Modules a school turns on per plan: Students, Academics, Attendance, Fee Management, Accounts, Examinations, Communication, Transport, HR & Payroll, Library, Inventory & Assets, Gate & Security, AI Assistant, Analytics.
- Online payment is only for the school's Vidyanexa subscription. School fees are paid at the school office; the office records them and the app shows receipts.
- Each school sets its own rules, for example library loan period, fine per day, grace period and fine cap, fee late-fee rules, and which events text parents.
- Before any certificate is issued, the student's dues (fees, library, hostel, transport) are checked; after a transfer certificate the office is asked to mark the student as left.
- Provider settings (email, SMS and WhatsApp services, test sends) belong to the platform admin, never to schools.
- Not offered yet: biometric attendance machines (hidden until tested with real devices); SMS and WhatsApp sending (choices are saved, messages are logged until a provider is connected); the iPhone apps (waiting for an Apple Developer account).
- Undecided: whether the public website keeps advertising biometric machines while they are unavailable.

## Brand Commitments

- **Name:** Vidyanexa (renamed from EDUVIA). One word in one colour; "NEXA" is never set apart.
- **Mark:** the crest (shield, open book and flame) in `mobile/assets/brand/` and the web brand components; ink navy and antique gold are the crest's colours.
- **Voice:** plain, direct English that staff and parents with little technical confidence understand; no jargon or developer terms in front of schools.

## Evidence on Hand

- A complete demo school, "Green Valley Public School" (fictional), with demo accounts for every role; it must never be presented as a real customer.
- Real plan prices and module lists live in the pricing data (Basic, Pro, Max, custom).
- No real customers, testimonials, case studies, school counts or press yet; none may be invented.

## Product Principles

1. **One system for the whole school.** A new need becomes part of Vidyanexa, not a separate tool or add-on.
2. **Day-one simple.** If an office clerk or a parent needs training to do a common task, the design is wrong.
3. **Each school decides its own rules.** Fees, fines, timings and messages vary by school; the product sets sensible defaults and lets each school change them.
4. **Honest and safe.** Show only what is real (no fake claims, features that work), keep each school's data apart, and check dues and permissions before acting.
5. **Every role sees only its job.** Teachers, parents, drivers and office staff each get just what their role needs.

## Accessibility & Inclusion

- Parents and staff with low digital confidence, on low-cost Android phones, often with the phone's font size enlarged: layouts must hold up at large text sizes and narrow (360 dp) screens.
- Fingerprint and face unlock, light and dark themes, and large touch targets in the apps.
- Indian names and languages (Hindi, Punjabi and others) must display correctly in documents and exports.
