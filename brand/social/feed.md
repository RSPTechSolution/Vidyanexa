# Vidyanexa Instagram feed: posts 1–20

Ten posts in posting order: the 5 images and the 5 attendance Reels, alternating. Each has its file, a caption written
for school owners, principals and administrators, hashtags, tags and alt text. Copy everything inside a caption block
as it is.

- **Files:** `brand/social/out/posts/` (images, 1080×1350) and `brand/social/out/reels/` (Reels, 1080×1920, no sound).
- **Schedule:** three a week, for example Monday, Wednesday and Friday, between **7 and 9 pm IST**. Principals and
  owners scroll after school hours. Ten posts is about three and a half weeks.
- **Location tag on every post:** *Ludhiana, Punjab*. It puts the post in front of people browsing Ludhiana.
- **Reels:** add a trending track in Instagram before posting, and pick the frame with the headline and phone as the cover.
- **Hashtags:** paste them in the caption under the text. If Instagram ever lets you use only a few, keep the first
  five; they're ordered from most to least useful.
- **Bio:** have the link in bio go to www.vidyanexa.com/signup, and the bio say "School ERP for Indian schools ·
  Free 14-day trial · DM 'DEMO'". Every caption below points there.

## Scheduling with Metricool

`brand/social/metricool.csv` holds all twenty posts for Metricool's bulk import, at 7:30 pm. Posts 1–10 are scheduled
Monday, Wednesday and Friday from 26 October; posts 11–20 keep the date in their heading (5 November to 4 December). Its media is served from www.vidyanexa.com/social/ (each Reel with a cover image), so the site
must be deployed before importing. Rebuild the file after changing a caption here:
`node scripts/social/metricool.mjs` (from `web/`; `--start 2026-11-02` moves the dates).

1. In Metricool, set the brand's **timezone to Asia/Kolkata** (Settings → brand), so 19:30 means 7:30 pm in India.
2. **Planning → ⋯ → Import CSV**, choose `metricool.csv`, and set the formats to match: date **YYYY-MM-DD**, time
   **24 hours (00:00:00)**, durations in **seconds**.
3. Check the preview: twenty Instagram posts, fifteen as Reels with covers. Import.
4. Tags and the location aren't part of the CSV: open each scheduled post in Metricool to add the *Ludhiana, Punjab*
   location and any school tags before its date.

If Metricool reports unknown columns, download its own template (same menu) and run
`node scripts/social/metricool.mjs --template <downloaded file>`: the posts are written into its exact columns.

## Tagging Ludhiana schools

Tag schools where it's natural (they're in your audience, or you already know them), and no more than two or three
on a post. Tagging many accounts that don't know you looks like spam and can get the post reported or hidden. Better
ways to reach them: the Ludhiana location tag and hashtags (already in every post), sharing posts to your Story and
tagging there, and a short direct message offering a free demo.

Possible handles found online. **Open each on Instagram and check it's the school's official account before tagging:**

| School | Handle (check first) | Found via |
|---|---|---|
| Kundan Vidya Mandir | @kvmschool1941 | Linked from the school's Wikipedia page |
| The Asian School, Ludhiana | @theasianschoolldh | Listed on the school's website |

Other well-known Ludhiana schools to look up on Instagram (search the name, tag only the verified official account):
Sat Paul Mittal School · Sacred Heart Convent School, Sarabha Nagar · BCM Arya Model Senior Secondary School ·
Delhi Public School Ludhiana · Ryan International School, Ludhiana · Spring Dale Senior School · Guru Nanak Public
School, Sarabha Nagar · DAV Public School, Pakhowal Road.

## Hashtag sets

Mix one core set with one topic set per post (the posts below already do this). Keep each post under 15.

- **Core (every post):** #SchoolManagementSoftware #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa
- **Local reach:** #SchoolsInLudhiana #LudhianaCity #PunjabSchools #Punjab #LudhianaDiaries #Tricity
- **Decision makers:** #Principal #SchoolPrincipal #SchoolOwner #SchoolAdmin #SchoolLeadership #CBSESchool
- **Topics:** #Attendance #ParentApp #SchoolFees #EdTechIndia #SmartSchool #DigitalSchool #AIinEducation

---

## 1 · Image · `posts/1-teachers-attendance.png`

```
Attendance in 10 seconds. Not 10 minutes. ⏱️

Your teachers open their class on the phone, tap the 2–3 students who are absent or late, and press one button for everyone else. Saved. Parents of absent children are told straight away.

No registers to carry. No end-of-month totals to add up. The office sees every class, live.

👉 Free 14-day trial for your school: link in bio
💬 Or DM us "DEMO" and we'll show you in 15 minutes.

#SchoolManagementSoftware #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #Attendance #SchoolPrincipal #SchoolAdmin #PunjabSchools #SmartSchool #CBSESchool #EdTechIndia
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** A phone showing Class 5–A's register in Vidyanexa, every student marked, with the headline "Attendance in 10 seconds."

## 2 · Reel · `reels/attendance-1-ten-seconds.mp4`

```
A whole class, marked in 10 seconds. Watch. 👇

1️⃣ Open your class
2️⃣ "Mark rest present"
3️⃣ Save 🎉

Ab attendance ke liye register ki zarurat nahi.

Schools in Ludhiana: try Vidyanexa free for 14 days. Link in bio, or DM "DEMO".

#SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #Teachers #Attendance #SchoolsInLudhiana #DigitalSchool #EdTechIndia
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: a teacher marks Class 5–A present on a phone in three taps; confetti appears when it's saved.

## 3 · Image · `posts/2-parents-alert.png`

```
Parents ask the school one question more than any other: "Was my child in class today?" 🔔

With Vidyanexa they don't need to ask. The moment a teacher marks a student absent, the parent's phone shows it, along with homework, fees, notices and results.

Fewer calls to the office. More trust from parents.

👉 See it working: DM "DEMO" · free 14-day trial, link in bio

#SchoolManagementSoftware #ParentApp #Ludhiana #LudhianaSchools #Vidyanexa #SchoolERP #Parents #SchoolSafety #PunjabSchools #SchoolOwner #SmartSchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** A parent's phone showing the alert "Aarav Patel was marked absent today", with the headline "Know the moment your child is absent."

## 4 · Reel · `reels/attendance-2-parents-told.mp4`

```
Teacher taps "Absent". Seconds later, on the parent's phone. 📲

This is what parents remember about a school: that it kept them in the loop, every single day.

Vidyanexa: school ERP with apps for parents, teachers and drivers. Built for Indian schools, priced in rupees.

DM "DEMO" · Free 14-day trial, link in bio

#SchoolERP #ParentApp #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SchoolPrincipal #SchoolsInLudhiana #Punjab #EdTechIndia
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: a teacher marks Aarav absent with the reason "Fever"; the next scene shows his father's phone with the absence alert.

## 5 · Image · `posts/3-fees.png`

```
Fee season without the queue at the office window. ✅

Parents see exactly what's due for each child and get a receipt on their phone the moment they pay: UPI, cash or cheque. Your accounts team sees who has paid and who's pending, class by class, without a single register.

Reminders go out automatically before the due date.

👉 Free 14-day trial: link in bio · DM "DEMO" for a walkthrough

#SchoolFees #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SchoolAdmin #SchoolOwner #PunjabSchools #UPI #DigitalSchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** A parent's phone showing all quarterly fees paid with receipts, and the headline "Fees and receipts, sorted."

## 6 · Reel · `reels/attendance-3-scan-cards.mp4`

```
Morning gate rush, sorted. 🪪

Scan the student's ID card (or type the admission number) and they're marked in. After the cut-off time they're marked late, automatically.

Works with ID cards, QR codes and biometric machines.

Try it free for 14 days: link in bio. DM "DEMO".

#SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SmartSchool #SchoolSafety #Attendance #SchoolsInLudhiana #CBSESchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: three students checked in by admission number on a phone, each shown as late after the cut-off.

## 7 · Image · `posts/4-principals-dashboard.png`

```
Principals: what if you knew how today was going before the first bell? 🏫

Vidyanexa puts your whole school on one screen: who's present, fees collected today, staff on leave, notices and sign-ins, live.

16 modules (admissions to transport, exams to HR), one login, apps for parents, teachers and drivers.

👉 Book a free 15-minute demo: DM "DEMO" · trial link in bio

#SchoolPrincipal #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SchoolLeadership #SchoolOwner #PunjabSchools #EdTechIndia #CBSESchool
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** A laptop browser showing the Vidyanexa principal's dashboard: 97% present today, all 27 classes marked, fees collected.

## 8 · Reel · `reels/attendance-4-skipped-lessons.mp4`

```
Present at the morning roll call. Missing in Maths. 👀

Period attendance lets the class teacher tick who's missing in each lesson, so bunking doesn't go unnoticed and parents can be told the same day.

Vidyanexa · school ERP for Indian schools. Free 14-day trial, link in bio.

#SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #Teachers #SchoolDiscipline #Attendance #PunjabSchools #SmartSchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: a teacher opens the Maths period for Class 5–A and ticks one student as missing; it saves as "1 out".

## 9 · Image · `posts/5-ai-assistant.png`

```
Ask your school anything. In plain words. 💬

"Which students are below 75% attendance?"
"Who hasn't paid the Quarter 3 fee?"
"Whose birthday is it today?"

Vidyanexa's AI assistant answers from your own school's records in seconds, and only shows each person what their role is allowed to see.

👉 Try it with your own school: free 14-day trial, link in bio

#AIinEducation #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SmartSchool #SchoolPrincipal #EdTechIndia #DigitalSchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** A phone showing the Vidyanexa AI assistant answering "Which students are below 75% attendance?" with a table of names and percentages.

## 10 · Reel · `reels/attendance-5-below-75.mp4`

```
See who's slipping below 75%, before it becomes a problem. 📉

The whole school's attendance today at a glance, then one question to the AI assistant, and you have the names, classes and days missed.

Built for CBSE, ICSE and state board schools.
Schools in Ludhiana and across Punjab: DM "DEMO" or start free, link in bio.

#SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SchoolPrincipal #CBSESchool #AIinEducation #SchoolsInLudhiana #PunjabSchools
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** Screen recording: the school's attendance overview, then the AI assistant listing students below 75% attendance.

---

# Feature Reels: 5 November to 4 December

Ten Reels recorded from the app, one feature each, dated for the posting plan (Mon/Wed/Fri at 7:30 pm, plus Diwali and
Children's Day). They follow the first ten posts, which end on 16 November. Files are in `brand/social/out/reels/`
(`nov-*.mp4`). Each has a silent audio track, so add a trending sound in Instagram, or in Metricool's preview, before
it goes out.

## 11 · Reel · `reels/nov-1-diwali-notice.mp4` · 2026-11-05

```
Diwali holidays notice: ready in 10 seconds. 🪔

Type one line to the AI assistant, "Write a notice about Diwali holidays from 7 to 10 November", and get a ready draft. Post it, and it's on every parent's phone at once.

No typing, no printing, no WhatsApp forwards.

Wishing every school, teacher and family a very Happy Diwali! ✨

Try Vidyanexa free for 14 days: link in bio · DM "DEMO"

#HappyDiwali #Diwali2026 #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #AIinEducation #SchoolPrincipal #PunjabSchools #SchoolsInLudhiana #EdTechIndia
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** Screen recording: a principal asks the AI assistant for a Diwali holidays notice, gets a draft, and the notice appears on a parent's phone.

## 12 · Reel · `reels/nov-2-childrens-day.mp4` · 2026-11-14

```
Happy Children's Day! 🎈

Every child is curious, kind and full of big dreams. Today schools across India celebrate them, and the message reaches every parent's phone the moment it's sent.

To every teacher who believes in their students: thank you. 💛

Vidyanexa: bringing schools and families closer, every day.

#ChildrensDay #BalDiwas #HappyChildrensDay #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #ParentApp #SchoolsInLudhiana #PunjabSchools #SchoolManagementSoftware
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** Screen recording: a parent opens a notification from school and reads the "Happy Children's Day" message from the principal.

## 13 · Reel · `reels/nov-3-fee-day.mp4` · 2026-11-18

```
Fee day without the queue. 🧾

Parent paid by UPI? Find the student, tap "Collect payment", choose UPI, done. The receipt is made automatically, and the parent's phone shows "Fee received ₹10,000" straight away.

No receipt books. No "did you get my payment?" calls.

Free 14-day trial for your school: link in bio · DM "DEMO"

#SchoolFees #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #UPI #SchoolAdmin #SchoolAccounts #PunjabSchools #DigitalSchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: the accounts team records a ₹10,000 UPI fee payment and makes a receipt; the next scene shows the father's phone with the "Fee received" alert.

## 14 · Reel · `reels/nov-4-school-bus.mp4` · 2026-11-20

```
"Bus kahan pahunchi?" Parents can see for themselves. 🚌

The driver's phone shares the bus's location, and parents watch it move on the map, live. When their child gets on, they're told at once.

Fewer calls to the transport in-charge. Calmer mornings for everyone.

Vidyanexa · school ERP with apps for parents, teachers and drivers. DM "DEMO" · link in bio

#SchoolBus #SchoolTransport #SchoolSafety #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #ParentApp #GPSTracking #SchoolsInLudhiana #SchoolManagementSoftware
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: a parent's phone showing the school bus moving along its route on a live map, then "Got on the bus" when the child boards.

## 15 · Reel · `reels/nov-5-principal-745.mp4` · 2026-11-23

```
POV: it's 7:45 am and you already know how today is going. ☕

Who's present and absent, fees collected, staff on leave, notices, sign-ins: your whole school on one screen, before the first bell.

Principals and school owners: book a free 15-minute demo. DM "DEMO" · trial link in bio

#SchoolPrincipal #POV #SchoolLeadership #SchoolOwner #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #CBSESchool #PunjabSchools
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** Screen recording: the principal's dashboard at 7:45 am, scrolling through today's attendance, fees, staff and sign-in activity.

## 16 · Reel · `reels/nov-6-homework-done.mp4` · 2026-11-25

```
Homework, done. ✅

The teacher sets tonight's homework in a few taps. It's on every parent's phone straight away. Done at home? One tap on "Mark as done", and the teacher sees it.

No more "Ma'am, my child didn't write the homework in the diary."

Free 14-day trial: link in bio · DM "DEMO"

#Homework #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #ParentApp #Teachers #SchoolManagementSoftware #SchoolsInLudhiana #DigitalSchool #EdTechIndia
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: a teacher sets "Fractions practice: Exercise 6.1" for Class 5–A; a parent sees it and marks it done.

## 17 · Reel · `reels/nov-7-gate-pass.mp4` · 2026-11-27

```
No gate pass, no exit. 🔐

Early pickup? The parent asks from their phone. The class teacher approves. The family gets a one-time code, and the guard checks it at the gate: right child, right person, right time.

Every exit recorded. Peace of mind for parents and schools.

Vidyanexa: gate passes, visitors and campus safety. DM "DEMO" · link in bio

#SchoolSafety #ChildSafety #GatePass #SchoolSecurity #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SchoolPrincipal #PunjabSchools
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** Screen recording: a parent requests an early pickup, the class teacher approves, the parent gets a 6-digit code, and the security guard checks it at the gate.

## 18 · Reel · `reels/nov-8-who-hasnt-paid.mp4` · 2026-11-30

```
Who hasn't paid the fee? Just ask. 💬

"Fee defaulters in Class 9": the AI assistant answers in seconds, with names, amounts and due dates. Then one tap sends a polite reminder to every family that's pending.

No registers. No awkward phone calls.

Try it with your own school: free 14-day trial, link in bio

#SchoolFees #FeeReminder #AIinEducation #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #SchoolManagementSoftware #SchoolAdmin #SchoolOwner #PunjabSchools
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: the AI assistant lists Class 9 students with overdue fees, then the accounts team opens fee reminders for every pending family.

## 19 · Reel · `reels/nov-9-leave-from-sofa.mp4` · 2026-12-02

```
Child unwell? Leave applied from the sofa. 🛋️

No handwritten note, no call to the office. The parent sends a leave request from the app, and the class teacher approves it with a "Get well soon" note. It's marked as leave, not absent.

Small things that make parents love their school. ❤️

DM "DEMO" · Free 14-day trial, link in bio

#ParentApp #LeaveApplication #SchoolERP #Ludhiana #LudhianaSchools #Vidyanexa #Parents #SchoolManagementSoftware #SchoolsInLudhiana #Teachers #DigitalSchool
```
**Tags:** location Ludhiana, Punjab
**Alt text:** Screen recording: a parent asks for a day's sick leave for Aarav, the class teacher approves with a note, and the parent sees it approved.

## 20 · Reel · `reels/nov-10-school-in-2-minutes.mp4` · 2026-12-04

```
Your school, set up in 2 minutes. 🚀

School name, your details, confirm your email with a code, and you're in: attendance, fees, homework, transport, exams and more, ready to use.

✅ Free for 14 days
✅ No card needed
✅ Apps for parents, teachers and drivers

Start now: link in bio · or DM "DEMO" and we'll set it up with you.

#SchoolERP #SchoolManagementSoftware #Ludhiana #LudhianaSchools #Vidyanexa #SchoolOwner #SchoolPrincipal #SchoolsInLudhiana #PunjabSchools #EdTechIndia #FreeTrial
```
**Tags:** location Ludhiana, Punjab · up to two verified school accounts
**Alt text:** Screen recording: a new school, Sunrise Academy in Ludhiana, signs up, confirms the email with a code and lands on its own dashboard.
