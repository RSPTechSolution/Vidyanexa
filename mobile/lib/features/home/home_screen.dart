import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/auth/models.dart';
import '../../core/auth/session.dart';
import '../../core/config/app_config.dart';
import '../../shared/widgets/brand.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/motion.dart';
import '../attendance/attendance_data.dart';
import '../attendance/attendance_screens.dart' show statusColor;
import '../fees/fees_data.dart';
import '../homework/homework_screens.dart';
import '../notices/notices_screen.dart';
import '../academics/syllabus_screens.dart';
import '../transport/transport_screens.dart';
import '../notifications/notifications_screen.dart';
import '../timetable/timetable_screen.dart';
import 'today_widget.dart';

String greeting(DateTime now) => now.hour < 12 ? 'Good morning' : (now.hour < 17 ? 'Good afternoon' : 'Good evening');

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).value;
    if (auth is! SignedIn) return const SizedBox.shrink();
    final me = auth.me;
    final flavor = ref.watch(appConfigProvider).flavor;
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final month = isoMonth(DateTime.now());
    // Everything the cards below need. Until the first load finishes, one skeleton stands in for all of them, so the
    // cards appear together instead of popping in one by one and pushing each other down.
    final family = me.isFamily;
    final needed = <AsyncValue<Object?>>[
      if (me.role == 'driver' && me.hasModule('transport')) ref.watch(driverTodayProvider),
      if (family && me.hasModule('attendance')) ref.watch(myAttendanceProvider(month)),
      if (family && me.hasModule('fees')) ref.watch(myFeesProvider),
      if (family && me.hasModule('academics')) ...[ref.watch(myHomeworkProvider), ref.watch(myTimetablesProvider)],
      if (!family && me.hasModule('attendance') && me.can('attendance.mark')) ref.watch(attendanceSectionsProvider(isoDay(DateTime.now()))),
      if (!family && me.hasModule('fees') && me.can('fees.view')) ref.watch(feeSummaryProvider),
      if (!family && me.hasModule('academics') && me.teaches) ...[ref.watch(myCoversProvider), ref.watch(myTimetablesProvider)],
    ];
    final loading = needed.any((v) => v.isLoading && !v.hasValue && !v.hasError);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            const BrandMark(size: 32),
            const SizedBox(width: 10),
            Wordmark(fontSize: 20, suffix: flavor.suffix),
          ],
        ),
        actions: [const NotificationBell(), const SizedBox(width: 4)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myAttendanceProvider(month));
          ref.invalidate(myFeesProvider);
          ref.invalidate(myTimetablesProvider);
          ref.invalidate(attendanceSectionsProvider(isoDay(DateTime.now())));
          ref.invalidate(feeSummaryProvider);
          ref.invalidate(myHomeworkProvider);
          ref.invalidate(unreadNoticesProvider);
          await ref.read(authControllerProvider.notifier).refreshProfile();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Text('${greeting(DateTime.now())}, ${me.firstName}', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(DateFormat('EEEE, d MMMM').format(DateTime.now()), style: TextStyle(color: muted)),
            const SizedBox(height: 20),
            if (me.school != null)
              Entrance(
                child: _SchoolCard(school: me.school!, role: me.role),
              ),
            const SizedBox(height: 16),
            if (loading)
              const _HomeSkeleton()
            else
              // The cards rise in one after another once their data is ready.
              ...[
                if (me.role == 'driver' && me.hasModule('transport')) const DriverCard(),
                if (me.isFamily) ...[
                  if (me.hasModule('attendance') || me.hasModule('fees')) const _FamilyCards(),
                  if (me.hasModule('academics')) const _HomeworkDue(),
                  if (me.hasModule('academics')) const _TodayLessons(),
                ] else ...[
                  if (me.hasModule('attendance') && me.can('attendance.mark')) const _AttendanceToTake(),
                  if (me.hasModule('fees') && me.can('fees.view')) const _FeeTiles(),
                  if (me.hasModule('academics') && me.teaches) const CoversCard(),
                  if (me.hasModule('academics') && me.teaches) const _TodayLessons(),
                ],
              ].indexed.map((e) => Entrance(index: e.$1 + 1, child: e.$2)),
            const SizedBox(height: 16),
            Entrance(
              index: 5,
              child: _ComingUp(flavor: flavor, modules: me.modules),
            ),
          ],
        ),
      ),
    );
  }
}

/// Stands in for the home cards while they load, shaped like the real thing: a summary card, then a heading and rows.
class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Shimmer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BoneCard(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Bone.circle(40),
                    SizedBox(width: 12),
                    Expanded(
                      child: FractionallySizedBox(alignment: Alignment.centerLeft, widthFactor: 0.55, child: Bone(height: 14)),
                    ),
                  ],
                ),
                SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: Bone(height: 56, radius: 12)),
                    SizedBox(width: 10),
                    Expanded(child: Bone(height: 56, radius: 12)),
                  ],
                ),
              ],
            ),
          ),
          SizedBox(height: 10),
          Padding(
            padding: EdgeInsets.only(top: 14, bottom: 14),
            child: Align(alignment: Alignment.centerLeft, child: Bone(width: 130, height: 16)),
          ),
          SkeletonTile(),
          SizedBox(height: 8),
          SkeletonTile(),
        ],
      ),
    );
  }
}

class _SchoolCard extends StatelessWidget {
  const _SchoolCard({required this.school, required this.role});
  final SchoolBrief school;
  final String role;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: scheme.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.school_outlined, color: scheme.primary),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(school.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(roleLabel(role), style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text, {this.action, this.onAction});
  final String text;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8, bottom: 6),
    child: Row(
      children: [
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        ),
        if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
      ],
    ),
  );
}

/// Parents and students: today's attendance and fees, per child.
class _FamilyCards extends ConsumerWidget {
  const _FamilyCards();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider)!;
    final att = me.hasModule('attendance') ? ref.watch(myAttendanceProvider(isoMonth(DateTime.now()))) : null;
    final fees = me.hasModule('fees') ? ref.watch(myFeesProvider) : null;
    final kids = att?.value ?? const <StudentAttendance>[];
    final feeKids = fees?.value?.children ?? const <ChildFees>[];
    if ((att?.isLoading ?? false) || (fees?.isLoading ?? false)) return const SkeletonList(count: 1, height: 120, padding: EdgeInsets.only(bottom: 10));
    final ids = {for (final k in kids) k.studentId: k.name, for (final f in feeKids) f.studentId: f.name};
    if (ids.isEmpty) return const SizedBox.shrink();
    // Keep the home-screen widget in step with what Home shows.
    WidgetsBinding.instance.addPostFrameCallback((_) => updateTodayWidget(attendance: kids, fees: feeKids));
    final today = DateTime.now();
    final s = statusColors(context);
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        for (final entry in ids.entries)
          Builder(
            builder: (context) {
              final a = kids.where((k) => k.studentId == entry.key).firstOrNull;
              final f = feeKids.where((k) => k.studentId == entry.key).firstOrNull;
              final mark = a?.on(today);
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: scheme.primary.withValues(alpha: 0.12),
                            child: Text(
                              entry.value.split(' ').map((p) => p[0]).take(2).join(),
                              style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w700),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(entry.value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                Text(a?.classSection ?? f?.classSection ?? '', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
                              ],
                            ),
                          ),
                          if (a != null) PercentRing(value: a.monthPercent, size: 54, label: 'month'),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          if (a != null)
                            Expanded(
                              child: _MiniStat(
                                icon: mark == null ? Icons.hourglass_empty_rounded : Icons.event_available_rounded,
                                color: mark == null ? scheme.onSurfaceVariant : statusColor(context, mark.status),
                                title: 'Today',
                                value: mark == null ? (today.weekday == 7 ? 'Holiday' : 'Not marked yet') : statusMeta[mark.status]!.label,
                                onTap: () => context.go('/attendance'),
                              ),
                            ),
                          if (a != null && f != null) const SizedBox(width: 8),
                          if (f != null)
                            Expanded(
                              child: _MiniStat(
                                icon: Icons.account_balance_wallet_outlined,
                                color: f.overdue > 0
                                    ? s.danger
                                    : f.due > 0
                                    ? scheme.primary
                                    : s.success,
                                title: f.overdue > 0 ? '${inr(f.overdue)} overdue' : 'Fees due',
                                value: f.due > 0 ? inr(f.due) : 'Paid up',
                                onTap: () => context.go('/fees'),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.icon, required this.color, required this.title, required this.value, required this.onTap});
  final IconData icon;
  final Color color;
  final String title;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      // Ink, not Container, so the ripple shows on top of the tinted background.
      child: Ink(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  Text(
                    value,
                    style: TextStyle(fontWeight: FontWeight.w700, color: color),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _HomeworkDue extends ConsumerWidget {
  const _HomeworkDue();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(myHomeworkProvider).value;
    if (list == null) return const SizedBox.shrink();
    final todo = list.where((h) => h.status == 'pending').toList()..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final many = {for (final h in list) h.studentId}.length > 1;
    final s = statusColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading('Homework to do', action: 'All', onAction: () => context.go('/homework')),
        Card(
          child: todo.isEmpty
              ? ListTile(
                  leading: Icon(Icons.celebration_outlined, color: s.success),
                  title: const Text('All caught up'),
                )
              : Column(
                  children: [
                    for (final h in todo.take(4))
                      ListTile(
                        dense: true,
                        leading: Icon(Icons.circle, size: 10, color: h.overdue ? s.danger : Theme.of(context).colorScheme.primary),
                        title: Text('${h.subject}: ${h.title}', maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          [h.overdue ? 'Overdue' : dueText(h.dueDate), if (many) h.studentName!.split(' ').first].join(' · '),
                          style: TextStyle(color: h.overdue ? s.danger : null),
                        ),
                        onTap: () => context.go('/homework'),
                      ),
                    if (todo.length > 4) ListTile(dense: true, title: Text('and ${todo.length - 4} more'), onTap: () => context.go('/homework')),
                  ],
                ),
        ),
      ],
    );
  }
}

class _TodayLessons extends ConsumerWidget {
  const _TodayLessons();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myTimetablesProvider);
    final views = async.value;
    if (views == null || views.isEmpty) return const SizedBox.shrink();
    final v = views.first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading(
          views.length > 1 ? "Today · ${v.title}" : (v.kind == 'teacher' ? "Today's classes" : "Today's lessons"),
          action: 'Week',
          onAction: () => context.push('/timetable'),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: DayLessons(view: v, day: DateTime.now().weekday, compact: true),
          ),
        ),
      ],
    );
  }
}

class _AttendanceToTake extends ConsumerWidget {
  const _AttendanceToTake();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = isoDay(DateTime.now());
    final async = ref.watch(attendanceSectionsProvider(day));
    if (async.isLoading) return const SkeletonList(count: 1, height: 90, padding: EdgeInsets.only(bottom: 10));
    final list = async.value;
    if (list == null || list.isEmpty) return const SizedBox.shrink();
    final pending = list.where((s) => !s.done).toList();
    final s = statusColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading('Attendance today', action: 'All classes', onAction: () => context.go('/attendance')),
        Card(
          child: Column(
            children: [
              if (pending.isEmpty)
                ListTile(
                  leading: Icon(Icons.check_circle_rounded, color: s.success),
                  title: const Text('All your classes are marked'),
                )
              else
                for (final c in pending.take(4))
                  ListTile(
                    leading: Icon(Icons.fact_check_outlined, color: Theme.of(context).colorScheme.primary),
                    title: Text(c.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${c.students} students${c.isClassTeacher ? ' · your class' : ''}'),
                    trailing: FilledButton.tonal(
                      onPressed: () async {
                        await context.push('/attendance/mark/${c.sectionId}?date=$day&label=${Uri.encodeComponent(c.label)}');
                        ref.invalidate(attendanceSectionsProvider(day));
                      },
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 36)),
                      child: const Text('Mark'),
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FeeTiles extends ConsumerWidget {
  const _FeeTiles();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(feeSummaryProvider).value;
    if (s == null) return const SizedBox.shrink();
    final st = statusColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading('Fees', action: 'Open', onAction: () => context.go('/fees')),
        Row(
          children: [
            Expanded(
              child: _MiniStat(
                icon: Icons.currency_rupee_rounded,
                color: st.success,
                title: 'Collected today',
                value: inr(s.collectedToday),
                onTap: () => context.go('/fees'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _MiniStat(
                icon: Icons.warning_amber_rounded,
                color: st.danger,
                title: '${s.overdueInvoices} overdue',
                value: inr(s.overdue),
                onTap: () => context.go('/fees'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Features the school uses that this app doesn't show yet.
class _ComingUp extends StatelessWidget {
  const _ComingUp({required this.flavor, required this.modules});
  final AppFlavor flavor;
  final List<String> modules;

  static const _features = {
    AppFlavor.parent: [
      ('exams', Icons.assignment_outlined, 'Results', 'Marks and report cards'),
      ('transport', Icons.directions_bus_outlined, 'Bus tracking', 'Live location of the school bus'),
      ('communication', Icons.chat_bubble_outline, 'Messages', 'Notices and chat with teachers'),
    ],
    AppFlavor.staff: [
      ('academics', Icons.menu_book_outlined, 'Homework', 'Assign and review work'),
      ('exams', Icons.edit_note_outlined, 'Marks entry', 'Enter and publish results'),
      ('hr', Icons.beach_access_outlined, 'Leave', 'Apply and track approvals'),
      ('communication', Icons.chat_bubble_outline, 'Messages', 'Talk to parents and colleagues'),
    ],
    AppFlavor.driver: [
      ('transport', Icons.route_outlined, 'Trips', 'Start trips and share live location'),
      ('transport', Icons.how_to_reg_outlined, 'Boarding', 'Mark students on and off the bus'),
    ],
  };

  @override
  Widget build(BuildContext context) {
    final items = _features[flavor]!.where((f) => modules.contains(f.$1)).toList();
    if (items.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Coming soon', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text('Your school uses these too. They will appear here as each one is set up.', style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 8),
            for (final (_, icon, title, subtitle) in items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(icon, color: scheme.primary),
                title: Text(title),
                subtitle: Text(subtitle),
              ),
          ],
        ),
      ),
    );
  }
}
