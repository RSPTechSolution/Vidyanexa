import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/models.dart';
import '../../core/auth/session.dart';
import '../attendance/my_class_screen.dart' show myClassesProvider;
import '../notices/notices_screen.dart';

/// Everything that doesn't fit in the bottom bar.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    if (me == null) return const SizedBox.shrink();
    final unread = ref.watch(unreadNoticesProvider).value ?? 0;
    final scheme = Theme.of(context).colorScheme;
    // A teacher's class-teacher (incharge) pages: My class, leave requests and early pickups are only for their own class,
    // so a teacher without one doesn't see them (they would open empty).
    final teacher = me.role == 'teacher';
    final incharge = teacher && me.hasModule('attendance') && (ref.watch(myClassesProvider).value?.isNotEmpty ?? false);
    final classDuties = !teacher || incharge;
    final items = <(IconData, String, String, String, Widget?)>[
      if (incharge) (Icons.groups_outlined, 'My class', 'Your class: attendance, leave, fees and parents', '/my-class', null),
      if (me.hasModule('communication')) (Icons.campaign_outlined, 'Notices', 'Announcements from the school', '/notices',
          unread > 0 ? Badge(label: Text('$unread')) : null),
      if (me.hasModule('academics') && (me.isFamily || me.teaches)) (Icons.calendar_month_outlined, 'Timetable', me.isFamily ? 'The week, period by period' : 'Where you teach this week', '/timetable', null),
      if (me.hasModule('attendance') && (me.isFamily || (me.can('leave.approve') && classDuties))) (Icons.event_busy_outlined, me.isFamily ? 'Leave' : 'Leave requests', me.isFamily ? 'Tell the school before a day away' : 'Approve leave for your class', '/leave', null),
      if (me.hasModule('exams') && me.isFamily) (Icons.quiz_outlined, 'Online tests', 'Quizzes from teachers and scores', '/tests', null),
      if (me.hasModule('academics')) (Icons.videocam_outlined, 'Live classes', 'Online lessons with a Join button', '/live', null),
      if (me.hasModule('communication')) (Icons.forum_outlined, 'Messages', me.isFamily ? 'Write to the teachers' : 'Write to parents', '/messages', null),
      if (me.hasModule('communication') && me.isFamily) (Icons.handshake_outlined, 'Parent-teacher meetings', 'Book a time with the class teacher', '/ptm', null),
      if (me.hasModule('communication')) (Icons.poll_outlined, 'Surveys', 'Questions from the school', '/surveys', null),
      if (me.hasModule('transport') && me.isFamily) (Icons.directions_bus_outlined, 'School bus', 'Where the bus is right now', '/bus', null),
      if (me.hasModule('transport') && me.role == 'driver') (Icons.directions_bus_outlined, 'Driver', 'Trips, boarding and SOS', '/driver', null),
      if (me.hasModule('library')) (Icons.menu_book_outlined, 'Library books', 'Borrowed books, due dates and fines', '/my-library', null),
      if (me.hasModule('hostel') && me.isFamily) (Icons.hotel_outlined, 'Hostel', 'Room and warden', '/my-hostel', null),
      if (me.hasModule('security') && (me.isFamily || (me.can('leave.approve') && classDuties) || me.can('gatepass.issue'))) (Icons.confirmation_number_outlined, 'Gate passes', me.isFamily ? 'Collect your child early' : 'Approve early pickups', '/gate-pass', null),
      if (me.hasModule('security') && me.can('gate.manage')) (Icons.door_front_door_outlined, 'Gate desk', 'Pickup codes and visitors', '/gate', null),
      if (me.hasModule('cctv') && me.isFamily) (Icons.videocam_outlined, 'Classroom CCTV', 'Consent and live viewing', '/cctv', null),
      if (me.hasModule('hr') && !me.isFamily) (Icons.badge_outlined, 'My leave and pay', 'Leave balance, requests and payslips', '/my-hr', null),
      (Icons.event_note_outlined, 'School calendar', 'Holidays, exams and events', '/calendar', null),
      if (me.hasModule('academics') && me.isFamily) (Icons.menu_book_outlined, 'Syllabus', 'How far each subject has got', '/syllabus', null),
      if (me.hasModule('exams') && me.isFamily) (Icons.emoji_events_outlined, 'Results', 'Report cards and upcoming exams', '/results', null),
      if (me.hasModule('exams') && me.can('exams.marks')) (Icons.edit_note_rounded, 'Marks entry', 'Enter marks for your subjects', '/marks', null),
      (Icons.person_outline, 'Profile & settings', 'Password, theme and sign out', '/profile', null),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Card(
          child: ListTile(
            leading: CircleAvatar(backgroundColor: scheme.primary.withValues(alpha: 0.12), child: Text(me.initials, style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w700))),
            title: Text(me.fullName, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${roleLabel(me.role)}${me.school != null ? ' · ${me.school!.name}' : ''}'),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: Column(children: [
            for (final (icon, title, subtitle, route, trailing) in items)
              ListTile(
                leading: Icon(icon, color: scheme.primary),
                title: Text(title),
                subtitle: Text(subtitle),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [?trailing, const Icon(Icons.chevron_right)]),
                onTap: () async {
                  await context.push(route);
                  ref.invalidate(unreadNoticesProvider);
                },
              ),
          ]),
        ),
      ]),
    );
  }
}
