import 'package:eduvia/core/api/api_client.dart';
import 'package:eduvia/core/auth/auth_controller.dart';
import 'package:eduvia/core/auth/token_store.dart';
import 'package:eduvia/core/config/app_config.dart';
import 'package:eduvia/features/attendance/attendance_screens.dart';
import 'package:eduvia/features/exams/exam_screens.dart';
import 'package:eduvia/core/router/app_router.dart';
import 'package:eduvia/features/home/home_screen.dart' show greeting;
import 'package:eduvia/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'support/fake_api.dart';

ProviderContainer container(FakeApi fake, {AppFlavor flavor = AppFlavor.parent}) {
  final tokens = MemoryTokenStore()..access = 'a'..refresh = 'r';
  return ProviderContainer(retry: apiRetry, overrides: [
    appConfigProvider.overrideWithValue(AppConfig(flavor: flavor, apiBaseUrl: 'http://test')),
    tokenStoreProvider.overrideWithValue(tokens),
    apiClientProvider.overrideWith((ref) => ApiClient(baseUrl: 'http://test', tokens: tokens, adapter: fake)),
  ]);
}

Map<String, dynamic> invoice({double balance = 3000, bool overdue = true, String status = 'partial'}) => {
      'id': 'i1', 'invoice_no': 'INV-2627-00001', 'student_id': 's1', 'student_name': 'Aarav Patel', 'admission_no': 'GV1',
      'class_section': 'Class 5 – A', 'term': 'Quarter 2', 'due_date': '2026-07-15', 'total': 13000, 'discount': 0,
      'paid': 13000 - balance, 'balance': balance, 'status': status, 'overdue': overdue, 'academic_year': '2026-27',
      'issue_date': '2026-07-01', 'discount_reason': null, 'items': [{'name': 'Tuition', 'amount': 9000}, {'name': 'Development', 'amount': 4000}],
      'payments': [], 'guardian_phone': null,
    };

Map<String, dynamic> counts([Map<String, int> c = const {}]) => {'present': 0, 'absent': 0, 'late': 0, 'half_day': 0, 'leave': 0, ...c};

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  Future<void> pump(WidgetTester tester, ProviderContainer c) async {
    await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const VidyanexaApp()));
    await tester.pumpAndSettle();
  }

  testWidgets('tabs follow the role: parents get attendance, homework and fees', (tester) async {
    final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())));
    await pump(tester, container(fake));
    final bar = find.byType(NavigationBar);
    for (final label in ['Home', 'Attendance', 'Homework', 'Fees', 'More']) {
      expect(find.descendant(of: bar, matching: find.text(label)), findsOneWidget);
    }
  });

  testWidgets('tab labels stay on one line with a big phone font on a narrow phone', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3; // 360 wide, a Galaxy S24
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())));
    await pump(tester, container(fake));
    // The test font is wider than Lexend, so check the scaling the tab labels get rather than their measured size.
    final bar = find.byType(NavigationBar);
    expect(MediaQuery.textScalerOf(tester.element(find.descendant(of: bar, matching: find.text('Attendance')))).scale(10), 10);
    expect(MediaQuery.textScalerOf(tester.element(find.byType(Scaffold).first)).scale(10), 13); // the rest still follows the phone
  });

  testWidgets('home greets who is signed in, with their role and school (no picture since theme 3)', (tester) async {
    Finder art(String name) => find.byWidgetPredicate((w) => w is SvgPicture && (w.bytesLoader as SvgAssetLoader).assetName == 'assets/hero/$name.svg');
    final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())));
    await pump(tester, container(fake));
    expect(art('parent'), findsNothing);
    expect(find.text('Good ${greeting(DateTime.now()).split(' ').last}, Suresh'), findsOneWidget);
    expect(find.textContaining('Green Valley Public School'), findsOneWidget);
  });

  testWidgets('home shows an overdue fee once, and no stale coming-soon card', (tester) async {
    final me = meJson()..['modules'] = ['fees', 'exams', 'transport', 'communication'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /fees/my', (_) => (200, FakeApi.ok({
            'children': [{'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'due': 16000, 'overdue': 16000,
              'next_due_date': '2026-07-15', 'invoices': [invoice()]}],
            'total_due': 16000,
          })));
    await pump(tester, container(fake));
    expect(find.text('Fees overdue'), findsOneWidget);
    expect(find.text('₹16,000'), findsOneWidget);
    expect(find.text('₹16,000 overdue'), findsNothing);
    expect(find.text('Coming soon'), findsNothing); // results, bus and messages are already in the app
  });

  testWidgets("after the school's trial ends, the app says so instead of showing errors", (tester) async {
    final me = meJson();
    (me['school'] as Map)['subscription_ended'] = 'trial';
    final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(me)));
    await pump(tester, container(fake));
    expect(find.text("Your school's free trial has ended"), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('a teacher without fee access has no Fees tab', (tester) async {
    final me = meJson(role: 'teacher')..['permissions'] = ['school.view', 'attendance.view', 'attendance.mark'];
    final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(me)));
    await pump(tester, container(fake, flavor: AppFlavor.staff));
    final bar = find.byType(NavigationBar);
    expect(find.descendant(of: bar, matching: find.text('Attendance')), findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('Fees')), findsNothing);
  });

  testWidgets('parent sees what is due and is told to pay at the school office', (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())))
      ..on('GET /fees/my', (_) => (200, FakeApi.ok({
            'children': [{'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'due': 3000, 'overdue': 3000,
              'next_due_date': '2026-07-15', 'invoices': [invoice()]}],
            'total_due': 3000,
          })));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Fees')));
    await tester.pumpAndSettle();
    expect(find.text('₹3,000 is overdue'), findsOneWidget);
    expect(find.textContaining('at the school office'), findsOneWidget);
    expect(find.textContaining('Pay ₹3,000'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing); // no online payment
    expect(fake.calls.where((c) => c.contains('/pay')), isEmpty);
  });

  testWidgets('teacher marks the rest present, one absent, and saves', (tester) async {
    Map<String, dynamic>? sent;
    final me = meJson(role: 'teacher')..['permissions'] = ['school.view', 'attendance.view', 'attendance.mark'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /attendance/sections/sec1', (_) => (200, FakeApi.ok({
            'section_id': 'sec1', 'label': 'Class 5 – A', 'date': '2026-10-03', 'editable': true, 'locked_reason': null,
            'marked_by': null, 'marked_at': null, 'counts': counts(),
            'students': [
              for (final (i, n) in ['Aarav Patel', 'Diya Shah', 'Kabir Singh'].indexed)
                {'student_id': 'st$i', 'name': n, 'admission_no': 'GV$i', 'roll_no': i + 1, 'gender': 'male', 'status': null, 'remark': null, 'recent_percent': 92.5},
            ],
          })))
      ..on('PUT /attendance/sections/sec1', (req) {
        sent = (req.data as Map).cast();
        return (200, FakeApi.ok({}));
      });
    final c = container(fake, flavor: AppFlavor.staff);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: c,
      child: const MaterialApp(home: MarkAttendanceScreen(sectionId: 'sec1', date: '2026-10-03', label: 'Class 5 – A')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('3 left'), findsOneWidget);

    await tester.tap(find.text('A').at(1));
    await tester.pump();
    await tester.tap(find.text('Rest present'));
    await tester.pump();
    expect(find.text('Present 2'), findsOneWidget);
    expect(find.text('Absent 1'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    final records = (sent!['records'] as List).cast<Map>();
    expect(sent!['date'], '2026-10-03');
    expect({for (final r in records) r['student_id']: r['status']}, {'st0': 'present', 'st1': 'absent', 'st2': 'present'});
  });

  testWidgets('parent attendance shows the year ring and days away', (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())))
      ..on('GET /attendance/my', (_) => (200, FakeApi.ok([{
            'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'month': '2026-10',
            'days': [{'date': '2026-10-01', 'status': 'present', 'remark': null}, {'date': '2026-10-02', 'status': 'absent', 'remark': 'Fever'}],
            'month_counts': counts({'present': 1, 'absent': 1}), 'month_percent': 50.0,
            'year_counts': counts({'present': 60, 'absent': 6}), 'year_percent': 90.9,
          }])));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Attendance')));
    await tester.pumpAndSettle();
    expect(find.text('Aarav Patel'), findsWidgets);
    expect(find.textContaining('50% · low'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Friday, 2 Oct'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Friday, 2 Oct'), findsOneWidget);
    expect(find.text('Absent · Fever'), findsOneWidget);
  });

  testWidgets('parent ticks off homework and opens a notice from the notification centre', (tester) async {
    var done = false;
    Map<String, dynamic> hw() => {
          'id': 'h1', 'section_id': 'sec', 'section_label': 'Class 5 – A', 'subject_id': 'm', 'subject_name': 'Mathematics', 'subject_color': 'blue',
          'title': 'Exercise 3.1', 'details': null, 'assigned_on': '2026-10-01', 'due_date': '2099-10-06', 'teacher': 'Priya Verma',
          'students': 8, 'done': 0, 'checked': 0, 'can_edit': false, 'student_id': 's1', 'student_name': 'Aarav Patel',
          'status': done ? 'done' : 'pending', 'note': null, 'remark': null, 'overdue': false,
          'attachments': [{'id': 'f1', 'filename': 'worksheet.pdf', 'content_type': 'application/pdf', 'size': 2048, 'label': null, 'created_at': '2026-10-01T10:00:00Z'}],
        };
    var read = false;
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['attendance', 'fees', 'academics', 'communication', 'exams'])))
      ..on('GET /homework/my', (_) => (200, FakeApi.ok([hw()])))
      ..on('POST /homework/h1/done', (req) {
        expect(req.data['student_id'], 's1');
        done = true;
        return (200, FakeApi.ok({'message': 'ok'}));
      })
      ..on('GET /notifications/unread-count', (_) => (200, FakeApi.ok({'count': read ? 1 : 2})))
      ..on('GET /notifications', (_) => (200, FakeApi.ok([
            {'id': 'x1', 'kind': 'notice', 'title': 'Diwali vacation', 'body': 'School closed 20–25 Oct', 'link': '/notices', 'data': {},
             'read': read, 'created_at': '2026-10-02T10:00:00Z'},
            {'id': 'x2', 'kind': 'homework', 'title': 'New homework: Mathematics', 'body': 'Exercise 3.1', 'link': '/my-homework', 'data': {},
             'read': false, 'created_at': '2026-10-01T10:00:00Z'},
          ])))
      ..on('POST /notifications/x1/read', (_) {
        read = true;
        return (200, FakeApi.ok({'message': 'ok'}));
      })
      ..on('GET /notices/unread-count', (_) => (200, FakeApi.ok({'count': 1})))
      ..on('GET /notices', (_) => (200, FakeApi.ok([
            {'id': 'n1', 'title': 'Diwali vacation', 'body': 'School closed 20–25 Oct', 'audience': 'everyone', 'audience_label': 'Everyone', 'section_ids': [],
             'priority': 'important', 'pinned': true, 'created_at': '2026-10-02T10:00:00Z', 'author': 'Principal', 'read': false, 'can_edit': false},
          ])))
      ..on('POST /notices/n1/read', (_) => (200, FakeApi.ok({'message': 'ok'})));
    await pump(tester, container(fake));
    expect(find.text('Homework to do'), findsOneWidget);
    expect(find.byTooltip('Notifications, 2 unread'), findsOneWidget);

    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Homework')));
    await tester.pumpAndSettle();
    expect(find.text('worksheet.pdf'), findsOneWidget);
    await tester.tap(find.byTooltip('Mark as done'));
    await tester.pumpAndSettle();
    expect(done, isTrue);
    expect(find.textContaining('Marked done'), findsOneWidget);

    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Home')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Notifications, 2 unread'));
    await tester.pumpAndSettle();
    expect(find.text('New homework: Mathematics'), findsOneWidget);
    await tester.tap(find.text('Diwali vacation'));
    await tester.pumpAndSettle();
    expect(fake.calls, contains('POST /notifications/x1/read'));
    expect(find.widgetWithText(AppBar, 'Notices'), findsOneWidget);
    await tester.tap(find.text('Diwali vacation'));
    await tester.pumpAndSettle();
    expect(find.text('School closed 20–25 Oct'), findsWidgets);
    expect(fake.calls, contains('POST /notices/n1/read'));
  });

  testWidgets('results list opens the report card', (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['academics', 'exams'])))
      ..on('GET /exams/my', (_) => (200, FakeApi.ok([{
            'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A',
            'exams': [{'exam_id': 'e1', 'exam_name': 'Half-Yearly', 'kind': 'term', 'published_at': '2026-10-01T10:00:00Z', 'percent': 83.9, 'grade': 'A2', 'rank': 2, 'class_size': 8, 'passed': true}],
            'upcoming': [],
          }])))
      ..on('GET /exams/e1/report/s1', (_) => (200, FakeApi.ok({
            'exam_id': 'e1', 'exam_name': 'Half-Yearly', 'academic_year': '2026-27', 'school_name': 'GVPS', 'school_address': null,
            'student_name': 'Aarav Patel', 'admission_no': 'GV1', 'class_section': 'Class 5 – A', 'roll_no': 1, 'date_of_birth': '2015-08-21',
            'class_teacher': 'Priya Verma', 'class_size': 8, 'attendance_percent': 90.8, 'published': true,
            'result': {'student_id': 's1', 'name': 'Aarav Patel', 'roll_no': 1, 'total': 402.5, 'max_total': 480, 'percent': 83.9, 'grade': 'A2',
              'passed': true, 'rank': 2, 'remark': 'Very good progress.',
              'subjects': [{'subject_name': 'Mathematics', 'max_marks': 80, 'pass_marks': 27, 'marks': 66.5, 'absent': false, 'grade': 'A2', 'passed': true}]},
          })));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Results'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Results'));
    await tester.pumpAndSettle();
    expect(find.text('Rank 2 of 8'), findsOneWidget);
    await tester.tap(find.text('Half-Yearly'));
    await tester.pumpAndSettle();
    expect(find.text('66.5/80'), findsOneWidget);
    expect(find.text('Very good progress.'), findsOneWidget);
  });

  testWidgets('teacher enters marks and an absence', (tester) async {
    Map<String, dynamic>? sent;
    final me = meJson(role: 'teacher')..['permissions'] = ['school.view', 'exams.view', 'exams.marks'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /exams/papers/p1/sections/s1', (_) => (200, FakeApi.ok({
            'paper_id': 'p1', 'section_id': 's1', 'exam_name': 'Unit Test 2', 'section_label': 'Class 5 – A', 'subject_name': 'Mathematics',
            'max_marks': 25, 'pass_marks': 8, 'editable': true, 'locked_reason': null,
            'rows': [
              {'student_id': 'a', 'name': 'Aarav Patel', 'roll_no': 1, 'marks': null, 'absent': false},
              {'student_id': 'b', 'name': 'Diya Shah', 'roll_no': 2, 'marks': null, 'absent': false},
            ],
          })))
      ..on('PUT /exams/papers/p1/sections/s1', (req) {
        sent = (req.data as Map).cast();
        return (200, FakeApi.ok({}));
      });
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container(fake, flavor: AppFlavor.staff),
      child: const MaterialApp(home: MarksEntryScreen(paperId: 'p1', sectionId: 's1')),
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '23');
    await tester.pump();
    expect(find.text('A1'), findsOneWidget); // 92%
    await tester.tap(find.byType(Checkbox).last);
    await tester.pump();
    await tester.tap(find.text('Save marks'));
    await tester.pumpAndSettle();
    final entries = {for (final e in (sent!['entries'] as List).cast<Map>()) e['student_id']: e};
    expect(entries['a']!['marks'], 23.0);
    expect(entries['b']!['absent'], isTrue);
  });

  testWidgets('parent opens syllabus progress from More', (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['academics'])))
      ..on('GET /syllabus/my', (_) => (200, FakeApi.ok([{
            'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A',
            'subjects': [{'section_id': 'sec', 'section_label': 'Class 5 – A', 'class_id': 'c5', 'subject_id': 'm', 'subject_name': 'Mathematics',
                          'subject_color': 'blue', 'total': 8, 'done': 3, 'percent': 37.5, 'behind': 1, 'last_topic': 'Fractions'}],
          }])));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Syllabus'));
    await tester.pumpAndSettle();
    expect(find.text('Mathematics'), findsOneWidget);
    expect(find.text('37.5%'), findsOneWidget);
    expect(find.text('3 of 8 topics · 1 behind plan'), findsOneWidget);
    expect(find.text('Latest: Fractions'), findsOneWidget);
  });

  testWidgets('teacher sees covers on the home screen', (tester) async {
    final me = meJson(role: 'teacher')..['permissions'] = ['school.view']..['modules'] = ['academics'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /substitutions/mine', (_) => (200, FakeApi.ok([{
            'id': 'x', 'date': '2026-10-13', 'period_id': 'p', 'period_name': 'P2', 'start_time': '08:40', 'end_time': '09:20',
            'section_id': 's', 'section_label': 'Class 7 – A', 'subject_name': 'Science', 'subject_color': 'green',
            'absent_teacher_id': 't', 'absent_teacher': 'Priya Verma', 'substitute_id': 'me', 'substitute': 'Me', 'note': null}])))
      ..on('GET /timetable/my', (_) => (200, FakeApi.ok([])));
    await pump(tester, container(fake, flavor: AppFlavor.staff));
    expect(find.text('Your covers'), findsOneWidget);
    expect(find.textContaining('Class 7 – A Science for Priya Verma'), findsOneWidget);
  });

  testWidgets('class teacher opens My class: attendance, fees and the roster with parents', (tester) async {
    final me = meJson(role: 'teacher')..['permissions'] = ['school.view', 'attendance.view', 'attendance.mark']..['modules'] = ['attendance', 'fees'];
    var reminded = false;
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /attendance/sections', (_) => (200, FakeApi.ok([])))
      ..on('GET /classes/my', (_) => (200, FakeApi.ok([{
            'section_id': 'sec1', 'label': 'Class 5 – A', 'is_class_teacher': true, 'students': 8, 'attendance_marked': true, 'present': 7,
            'absent': 1, 'on_leave': 0, 'pending_leave': 2, 'pending_gate_passes': 0, 'fees_enabled': true, 'students_overdue': 1, 'overdue_amount': 3000}])))
      ..on('GET /classes/my/sec1', (_) => (200, FakeApi.ok({'section_id': 'sec1', 'label': 'Class 5 – A', 'class_teacher': 'Priya Verma', 'fees_enabled': true,
            'month_start': '2026-10-01', 'students': [{'student_id': 's1', 'name': 'Aarav Patel', 'roll_no': 1, 'admission_no': 'GV1', 'photo_file_id': null,
              'today': 'present', 'attendance_percent': 96.0, 'days_absent': 0, 'fee_due': 3000, 'fee_overdue': true,
              'guardians': ['Suresh Patel (father) · +91 98140 20001']}]})))
      ..on('POST /classes/my/sec1/fee-reminders', (_) {
        reminded = true;
        return (200, FakeApi.ok({'invoices': 1, 'families': 1, 'emails': 0, 'skipped_recent': 0}));
      });
    await pump(tester, container(fake, flavor: AppFlavor.staff));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My class'));
    await tester.pumpAndSettle();
    expect(find.text('7/8'), findsOneWidget);
    expect(find.text('₹3,000 overdue'), findsOneWidget);
    expect(find.text('1. Aarav Patel'), findsOneWidget);
    expect(find.text('Suresh Patel (father) · +91 98140 20001'), findsOneWidget);
    await tester.tap(find.text('Remind parents'));
    await tester.pumpAndSettle();
    expect(reminded, isTrue);
    expect(find.text('Reminded 1 family about overdue fees'), findsOneWidget);
  });

  testWidgets("a parent's profile shows what is connected to them", (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['attendance'])))
      ..on('GET /attendance/my', (_) => (200, FakeApi.ok([])))
      ..on('GET /users/me/overview', (_) => (200, FakeApi.ok({
            'role': 'parent', 'class_teacher_of': [], 'teaching': [], 'buses': [], 'library': null, 'hr': null, 'ptm': [], 'student_overview': null,
            'children': [{'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'relationship': 'father', 'admission_no': 'GV1',
              'attendance_percent': 96.0, 'fee_due': 3000, 'fee_overdue': true}],
            'requests': [{'kind': 'leave', 'title': 'Leave (family)', 'detail': '14 Oct · Wedding', 'status': 'pending', 'on': '2026-10-14',
              'student_id': 's1', 'student_name': 'Aarav Patel'}]})));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Profile & settings'));
    await tester.pumpAndSettle();
    expect(find.text('Connected to you'), findsOneWidget);
    expect(find.text('Aarav Patel · Class 5 – A'), findsOneWidget);
    expect(find.textContaining('₹3,000 overdue'), findsOneWidget);
    expect(find.text('Leave (family) · Aarav Patel'), findsOneWidget);
  });

  testWidgets('parent asks for leave and sees it pending', (tester) async {
    var sent = <String, dynamic>{};
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['attendance'])))
      ..on('GET /attendance/my', (_) => (200, FakeApi.ok([{
            'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'month': '2026-10', 'days': [],
            'month_counts': counts(), 'month_percent': null, 'year_counts': counts(), 'year_percent': null}])))
      ..on('GET /leave', (_) => (200, FakeApi.ok(sent.isEmpty ? [] : [{
            'id': 'l1', 'student_id': 's1', 'student_name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'from_date': '2026-10-12',
            'to_date': '2026-10-13', 'days': 2, 'kind': 'sick', 'reason': sent['reason'], 'status': 'pending', 'requested_by': 'Suresh Patel',
            'requested_at': '2026-10-08T10:00:00Z', 'decided_by': null, 'decided_at': null, 'decision_note': null, 'can_decide': false, 'can_cancel': true}])))
      ..on('POST /leave', (req) {
        sent = Map<String, dynamic>.from(req.data as Map);
        return (201, FakeApi.ok({}));
      });
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Leave'));
    await tester.pumpAndSettle();
    expect(find.text('No leave requests'), findsOneWidget);
    await tester.tap(find.text('Ask for leave'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Fever since last night');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send request'));
    await tester.pumpAndSettle();
    expect(sent['student_id'], 's1');
    expect(sent['kind'], 'sick');
    expect(find.text('Fever since last night'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
  });

  testWidgets('student takes an online test and submits', (tester) async {
    Map<String, dynamic>? submitted;
    final soon = DateTime.now().toUtc().add(const Duration(minutes: 20)).toIso8601String();
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson(role: 'student')..['modules'] = ['exams'])))
      ..on('GET /online-tests/my', (_) => (200, FakeApi.ok([{
            'test_id': 't1', 'title': 'Fractions quiz', 'subject_name': 'Mathematics', 'student_id': 's1', 'student_name': 'Aarav Patel',
            'opens_at': '2026-10-08T03:00:00Z', 'closes_at': '2099-10-08T03:00:00Z', 'duration_minutes': 20, 'questions': 1, 'max_marks': 2,
            'state': 'open', 'score': null, 'percent': null, 'released': false}])))
      ..on('POST /online-tests/t1/start', (_) => (200, FakeApi.ok({
            'test_id': 't1', 'title': 'Fractions quiz', 'instructions': null, 'subject_name': 'Mathematics', 'deadline': soon, 'submitted': false,
            'questions': [{'id': 'q1', 'kind': 'single', 'text': 'Half of 8?', 'marks': 2, 'options': [{'id': 'a', 'text': '3'}, {'id': 'b', 'text': '4'}]}],
            'answers': {}})))
      ..on('POST /online-tests/t1/submit', (req) {
        submitted = Map<String, dynamic>.from(req.data as Map);
        return (200, FakeApi.ok({'test_id': 't1', 'title': 'Fractions quiz', 'student_id': 's1', 'student_name': 'Aarav Patel', 'submitted_at': soon,
                                 'score': 2, 'max_marks': 2, 'percent': 100.0, 'needs_marking': false, 'released': true, 'questions': []}));
      });
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Online tests'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Online tests'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start test'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.tap(find.text('4'));
    await tester.pump();
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
    await tester.tap(find.widgetWithText(FilledButton, 'Submit').last);
    await tester.pump(const Duration(seconds: 1));
    expect((submitted!['answers'] as Map)['q1'], ['b']);
    expect(find.text('Score 2 of 2'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('parent reads and replies to a teacher message', (tester) async {
    final sent = <String>[];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['communication'])))
      ..on('GET /chat/conversations', (_) => (200, FakeApi.ok([{
            'id': 'c1', 'student_id': 's1', 'student_name': 'Aarav Patel', 'other_id': 't1', 'other_name': 'Priya Verma', 'other_role': 'Teacher',
            'last_message': 'Please bring the project tomorrow', 'last_message_at': '2026-10-08T10:00:00Z', 'unread': 1}])))
      ..on('GET /chat/conversations/c1/messages', (_) => (200, FakeApi.ok([
            {'id': 'm1', 'mine': false, 'sender': 'Priya Verma', 'body': 'Please bring the project tomorrow', 'created_at': '2026-10-08T10:00:00Z', 'read': true},
            for (final b in sent) {'id': 'x$b', 'mine': true, 'sender': 'Me', 'body': b, 'created_at': '2026-10-08T10:05:00Z', 'read': false},
          ])))
      ..on('POST /chat/conversations/c1/messages', (req) {
        sent.add((req.data as Map)['body'] as String);
        return (201, FakeApi.ok({}));
      });
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Messages'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Messages'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Priya Verma'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Please bring the project tomorrow'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Sure, thank you!');
    await tester.tap(find.byTooltip('Send'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(sent, ['Sure, thank you!']);
    expect(find.text('Sure, thank you!'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 9));
  });

  testWidgets('driver starts a trip and marks a student on the bus', (tester) async {
    var boarded = false;
    Map<String, dynamic> trip() => {
          'id': 'tr1', 'route_id': 'r1', 'route_name': 'Route 1', 'vehicle_number': 'PB01 AB 1234', 'driver_name': 'Harpreet', 'driver_phone': null,
          'direction': 'pickup', 'status': 'running', 'started_at': '2026-10-09T02:00:00Z', 'ended_at': null, 'lat': null, 'lng': null, 'speed': null,
          'last_ping_at': null, 'stale': true, 'on_board': boarded ? 1 : 0, 'riders': 1, 'stops': [], 'path': [],
          'roster': [{'student_id': 's1', 'name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'stop_id': null, 'stop_name': 'Sector 21',
                      'parent_phone': null, 'boarded_at': boarded ? '2026-10-09T02:10:00Z' : null, 'dropped_at': null, 'absent': false}],
        };
    final me = meJson(role: 'driver')..['modules'] = ['transport']..['permissions'] = ['transport.drive'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /transport/driver/today', (_) => (200, FakeApi.ok({
            'vehicle': {'id': 'v1', 'number': 'PB01 AB 1234'}, 'running': null,
            'routes': [{'id': 'r1', 'name': 'Route 1', 'stops': [], 'riders': 1}]})))
      ..on('POST /transport/trips', (_) => (201, FakeApi.ok(trip())))
      ..on('POST /transport/trips/tr1/board', (_) {
        boarded = true;
        return (200, FakeApi.ok(trip()));
      });
    await pump(tester, container(fake, flavor: AppFlavor.driver));
    await tester.tap(find.text('Start a trip'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Morning pickup'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.textContaining('0 of 1 on board'), findsOneWidget);
    await tester.tap(find.text('On bus'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(boarded, isTrue);
    expect(find.text('Got off'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 16));
  });
  testWidgets('parent sees library books and the hostel room from More', (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['library', 'hostel'])))
      ..on('GET /library/mine', (_) => (200, FakeApi.ok([
            {'id': 'b1', 'accession_no': '00001', 'title': 'Wings of Fire', 'borrower': 'Aarav Patel', 'borrower_kind': 'student', 'class_section': 'Class 5 – A',
             'issued_on': '2026-09-28', 'due_on': '2026-10-12', 'returned_on': null, 'overdue_days': 0, 'fine': 0, 'fine_paid': false},
            {'id': 'b2', 'accession_no': '00025', 'title': 'Idgah', 'borrower': 'Diya Patel', 'borrower_kind': 'student', 'class_section': 'Class 1 – A',
             'issued_on': '2026-09-22', 'due_on': '2026-10-06', 'returned_on': null, 'overdue_days': 3, 'fine': 6, 'fine_paid': false},
          ])))
      ..on('GET /hostels/mine', (_) => (200, FakeApi.ok([
            {'student_id': 's1', 'name': 'Aarav Patel', 'hostel': 'Tagore House', 'room': 'G01', 'floor': 'Ground', 'since': '2026-04-03',
             'warden': 'Meenakshi Rao', 'warden_phone': '+91 98140 11111'},
          ])));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Library books'));
    await tester.pumpAndSettle();
    expect(find.text('Wings of Fire'), findsOneWidget);
    expect(find.textContaining('Return by 12 Oct 2026'), findsOneWidget);
    expect(find.textContaining('3 days late'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hostel'));
    await tester.pumpAndSettle();
    expect(find.text('Tagore House · Room G01'), findsOneWidget);
    expect(find.text('Warden: Meenakshi Rao'), findsOneWidget);
    expect(find.text('Call'), findsOneWidget);
  });
  Map<String, dynamic> pass({String status = 'approved', String? code = '482913'}) => {
        'id': 'gp1', 'student_id': 's1', 'student_name': 'Aarav Patel', 'class_section': 'Class 5 – A', 'photo_file_id': null, 'reason': 'Dentist',
        'pickup_name': 'Suresh Patel', 'pickup_relation': 'Father', 'pickup_phone': null, 'leave_at': '2026-10-09T07:00:00Z', 'status': status, 'code': code,
        'requested_by': 'Suresh Patel', 'decided_by': 'Priya Verma', 'decision_note': null, 'used_at': status == 'used' ? '2026-10-09T07:05:00Z' : null,
        'verified_by': null, 'can_decide': false, 'can_cancel': status == 'approved',
      };

  testWidgets('parent sees the gate pass code', (tester) async {
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['security'])))
      ..on('GET /gate/passes', (_) => (200, FakeApi.ok([pass()])));
    await pump(tester, container(fake));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gate passes'));
    await tester.pumpAndSettle();
    expect(find.text('482913'), findsOneWidget);
    expect(find.text('Show this code at the gate'), findsOneWidget);
    expect(find.text('Early pickup'), findsOneWidget);
  });

  testWidgets('guard checks a gate pass code and lets the child leave', (tester) async {
    var left = false;
    final me = meJson(role: 'security_guard')..['modules'] = ['security']..['permissions'] = ['gate.view', 'gate.manage', 'visitors.invite'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /gate/visitors', (_) => (200, FakeApi.ok([])))
      ..on('GET /gate/passes/verify', (_) => (200, FakeApi.ok(pass())))
      ..on('POST /gate/passes/gp1/left', (_) {
        left = true;
        return (200, FakeApi.ok(pass(status: 'used', code: null)));
      });
    await pump(tester, container(fake, flavor: AppFlavor.staff));
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Gate desk'));
    await tester.tap(find.text('Gate desk'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '482913');
    await tester.pump();
    await tester.tap(find.text('Check'));
    await tester.pumpAndSettle();
    expect(find.text('Aarav Patel · Class 5 – A'), findsOneWidget);
    expect(find.text('Going with Suresh Patel (Father)'), findsOneWidget);
    await tester.tap(find.text('Checked ID: let them leave'));
    await tester.pumpAndSettle();
    expect(left, isTrue);
    expect(find.text('Left school'), findsOneWidget);
  });

  testWidgets('messages: search the conversations and the people to write to', (tester) async {
    Map<String, dynamic> conv(String id, String name, String child) => {'id': id, 'student_id': 's1', 'student_name': child, 'other_id': 'o$id',
        'other_name': name, 'other_role': 'Teacher', 'last_message': 'Hello', 'last_message_at': '2026-10-08T10:00:00Z', 'unread': 0};
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson()..['modules'] = ['communication'])))
      ..on('GET /chat/conversations', (_) => (200, FakeApi.ok([conv('c1', 'Priya Verma', 'Aarav Patel'), conv('c2', 'Rakesh Gill', 'Diya Patel')])))
      ..on('GET /chat/contacts', (_) => (200, FakeApi.ok([
            for (final (n, c) in [('Priya Verma', 'Aarav Patel'), ('Rakesh Gill', 'Diya Patel'), ('Meena Arora', 'Diya Patel')])
              {'user_id': n, 'student_id': 's1', 'name': n, 'role': 'Teacher', 'student_name': c},
          ])));
    final c = container(fake);
    await pump(tester, c);
    c.read(routerProvider).push('/messages');
    await tester.pumpAndSettle();
    expect(find.text('Rakesh Gill'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Search messages'), 'aarav');
    await tester.pump();
    expect(find.text('Priya Verma'), findsOneWidget);
    expect(find.text('Rakesh Gill'), findsNothing);

    await tester.tap(find.text('New'));
    await tester.pumpAndSettle();
    final sheet = find.byType(DraggableScrollableSheet);
    expect(find.descendant(of: sheet, matching: find.text('Meena Arora')), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Search by name or child'), 'mee');
    await tester.pump();
    expect(find.descendant(of: sheet, matching: find.text('Meena Arora')), findsOneWidget);
    expect(find.descendant(of: sheet, matching: find.text('Priya Verma')), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Search by name or child'), 'zzz');
    await tester.pump();
    expect(find.text('Nobody matches'), findsOneWidget);
  });

  testWidgets('a class teacher sees their own homework and their class in separate tabs', (tester) async {
    final me = meJson(role: 'teacher')..['permissions'] = ['school.view', 'homework.manage']..['modules'] = ['academics'];
    Map<String, dynamic> hw(String id, String title, String subject, String teacher) => {
          'id': id, 'section_id': 'sec1', 'section_label': 'Class 5 – A', 'subject_id': 'x', 'subject_name': subject, 'subject_color': 'blue',
          'title': title, 'details': null, 'assigned_on': '2026-11-09', 'due_date': '2026-11-12', 'teacher': teacher,
          'students': 30, 'done': 0, 'checked': 0, 'can_edit': true, 'attachments': []};
    final views = <Object?>[];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /classes/my', (_) => (200, FakeApi.ok([{
            'section_id': 'sec1', 'label': 'Class 5 – A', 'is_class_teacher': true, 'students': 30, 'attendance_marked': false, 'present': 0,
            'absent': 0, 'on_leave': 0, 'pending_leave': 0, 'pending_gate_passes': 0, 'fees_enabled': false, 'students_overdue': 0, 'overdue_amount': 0}])))
      ..on('GET /homework', (req) {
        final view = req.queryParameters['view'];
        views.add(view);
        return (200, {'success': true, 'data': view == 'class'
            ? [hw('h1', 'Fractions, page 42', 'Mathematics', 'Priya Verma'), hw('h2', 'Water cycle drawing', 'Science', 'Arjun Rao')]
            : [hw('h1', 'Fractions, page 42', 'Mathematics', 'Priya Verma')],
          'meta': {'total': view == 'class' ? 2 : 1, 'page': 1, 'page_size': 25}});
      });
    final c = container(fake, flavor: AppFlavor.staff);
    await pump(tester, c);
    c.read(routerProvider).go('/homework');
    await tester.pumpAndSettle();
    expect(find.text('My homework'), findsOneWidget);
    expect(find.text('Fractions, page 42'), findsOneWidget);
    expect(find.text('Water cycle drawing'), findsNothing);
    await tester.tap(find.widgetWithText(Tab, 'Class 5 – A'));
    await tester.pumpAndSettle();
    expect(find.text('Water cycle drawing'), findsOneWidget);
    expect(find.textContaining('Arjun Rao'), findsOneWidget); // who set it
    expect(views, containsAll(['mine', 'class']));
  });

  testWidgets("More shows My class only to a teacher who is a class teacher (incharge)", (tester) async {
    for (final incharge in [false, true]) {
      final me = meJson(role: 'teacher')..['permissions'] = ['school.view', 'attendance.mark', 'leave.approve']..['modules'] = ['attendance'];
      final fake = FakeApi()
        ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
        ..on('GET /attendance/sections', (_) => (200, FakeApi.ok([])))
        ..on('GET /classes/my', (_) => (200, FakeApi.ok(incharge
            ? [{'section_id': 'sec1', 'label': 'Class 5 – A', 'is_class_teacher': true, 'students': 30, 'attendance_marked': false, 'present': 0,
                'absent': 0, 'on_leave': 0, 'pending_leave': 0, 'pending_gate_passes': 0, 'fees_enabled': false, 'students_overdue': 0, 'overdue_amount': 0}]
            : [])));
      final c = container(fake, flavor: AppFlavor.staff);
      await pump(tester, c);
      c.read(routerProvider).go('/more');
      await tester.pumpAndSettle();
      expect(find.text('My class'), incharge ? findsOneWidget : findsNothing, reason: 'incharge: $incharge');
      expect(find.text('Leave requests'), incharge ? findsOneWidget : findsNothing, reason: 'incharge: $incharge');
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    }
  });

  testWidgets('a teacher posts a notice to their class from the app', (tester) async {
    Map<String, dynamic>? posted;
    final me = meJson(role: 'teacher')
      ..['modules'] = ['communication']
      ..['permissions'] = ['school.view', 'notices.post'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /notices', (_) => (200, FakeApi.ok([])))
      ..on('GET /notices/unread-count', (_) => (200, FakeApi.ok({'count': 0})))
      ..on('GET /notices/sections', (_) => (200, FakeApi.ok([{'id': 'sec5a', 'label': 'Class 5 – A'}])))
      ..on('POST /notices', (req) {
        posted = (req.data as Map).cast<String, dynamic>();
        return (201, FakeApi.ok({}));
      });
    tester.view.physicalSize = const Size(1080, 3200); // the whole form on one screen
    addTearDown(tester.view.reset);
    final c = container(fake, flavor: AppFlavor.staff);
    await pump(tester, c);
    c.read(routerProvider).push('/notices');
    await tester.pumpAndSettle();
    await tester.tap(find.text('New notice'));
    await tester.pumpAndSettle();
    expect(find.text('Everyone'), findsNothing); // teachers write only to their classes
    await tester.enterText(find.byType(TextField).at(0), 'Science fair on Monday');
    await tester.enterText(find.byType(TextField).at(1), 'Bring your models by 9 am.');
    await tester.tap(find.text('Class 5 – A'));
    await tester.pump();
    await tester.tap(find.text('Post notice'));
    await tester.pumpAndSettle();
    expect(posted?['audience'], 'sections');
    expect(posted?['section_ids'], ['sec5a']);
    expect(posted?['title'], 'Science fair on Monday');
  });

  testWidgets('on a school holiday the home screen shows the school closed, not the classes', (tester) async {
    final me = meJson(role: 'teacher')
      ..['modules'] = ['academics', 'attendance']
      ..['permissions'] = ['school.view', 'attendance.view', 'attendance.mark'];
    final fake = FakeApi()
      ..on('GET /auth/me', (_) => (200, FakeApi.ok(me)))
      ..on('GET /calendar', (_) => (200, FakeApi.ok([{'title': 'Guru Nanak Jayanti', 'kind': 'holiday', 'start_date': '2026-11-05',
            'end_date': '2026-11-05', 'description': null}])))
      ..on('GET /timetable/my', (_) => (200, FakeApi.ok([{
            'kind': 'teacher', 'title': 'Priya Verma', 'subtitle': null,
            'periods': [{'id': 'p1', 'name': 'Period 1', 'start_time': '00:00:00', 'end_time': '23:59:00', 'is_break': false}],
            'entries': [for (var d = 1; d <= 7; d++) {'day': d, 'period_id': 'p1', 'subject_name': 'Mathematics', 'subject_color': 'blue', 'teacher_name': null, 'section_label': 'Class 5 – A', 'room': null}],
          }])));
    await pump(tester, container(fake, flavor: AppFlavor.staff));
    expect(find.text('School closed today: Guru Nanak Jayanti'), findsOneWidget);
    expect(find.text('Mathematics'), findsNothing);
  });
}

