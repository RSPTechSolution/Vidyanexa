import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/auth/models.dart';
import '../../core/auth/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/hero_banner.dart';
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
import '../../shared/selected_child.dart';
import 'more_screen.dart' show moreLinks;
import 'today_widget.dart';

/// The note on the Home picture: the date, or why the school is closed today.
String _todayChip(WidgetRef ref) {
  final closed = ref.watch(schoolClosedTodayProvider).value;
  final date = DateFormat('EEEE, d MMMM').format(DateTime.now());
  return closed == null ? date : '$date · $closed';
}

String greeting(DateTime now) => now.hour < 12 ? 'Good morning' : (now.hour < 17 ? 'Good afternoon' : 'Good evening');

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).value;
    if (auth is! SignedIn) return const SizedBox.shrink();
    final me = auth.me;
    final flavor = ref.watch(appConfigProvider).flavor;
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
      body: Stack(
        children: [
          Positioned(top: 0, left: 0, right: 0, height: 520, child: AppTheme.pageLight(Theme.of(context).colorScheme)),
          RefreshIndicator(
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
            // Theme 5: your initials on a peach tile, today's date (or why the school is closed), a bold greeting, and
            // who you are here.
            Row(
              children: [
                _Initials(me.initials),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_todayChip(ref), style: eyebrow(context), maxLines: 2),
                      Text('${greeting(DateTime.now())}, ${me.firstName}', style: serifHeading(context, size: 23)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              [roleLabel(me.role), if (me.school != null) me.school!.name].join(' · '),
              style: eyebrow(context).copyWith(fontSize: 13),
              maxLines: 2,
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
                  const _Shortcuts(),
                  if (me.hasModule('academics')) const _HomeworkDue(),
                  if (me.hasModule('academics')) const _TodayLessons(),
                ] else ...[
                  if (me.hasModule('attendance') && me.can('attendance.mark')) const _AttendanceToTake(),
                  if (me.role != 'driver') const _Shortcuts(),
                  if (me.hasModule('fees') && me.can('fees.view')) const _FeeTiles(),
                  if (me.hasModule('academics') && me.teaches) const CoversCard(),
                  if (me.hasModule('academics') && me.teaches) const _TodayLessons(),
                ],
              ].indexed.map((e) => Entrance(index: e.$1 + 1, child: e.$2)),
          ],
        ),
      ),
        ],
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
          child: Text(text, style: serifHeading(context, size: 18)),
        ),
        if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
      ],
    ),
  );
}

/// A family's children (id, name) in the order Home shows them, from attendance and fees.
List<(String, String)> _familyChildren(WidgetRef ref) {
  final me = ref.watch(meProvider);
  if (me == null || !me.isFamily) return const [];
  final kids = me.hasModule('attendance') ? ref.watch(myAttendanceProvider(isoMonth(DateTime.now()))).value ?? const <StudentAttendance>[] : const <StudentAttendance>[];
  final feeKids = me.hasModule('fees') ? ref.watch(myFeesProvider).value?.children ?? const <ChildFees>[] : const <ChildFees>[];
  final ids = {for (final k in kids) k.studentId: k.name, for (final f in feeKids) f.studentId: f.name};
  return [for (final e in ids.entries) (e.key, e.value)];
}

/// The child Home shows when a family has more than one (null with one child or none).
String? _shownChild(WidgetRef ref) {
  final kids = _familyChildren(ref);
  if (kids.length < 2) return null;
  final ids = [for (final k in kids) k.$1];
  return ids[childIndex(ref, ids)];
}

/// Parents and students: each child's day as soft-coloured tiles (theme 5): attendance in mint with this month's ring,
/// fees in peach, homework in lavender. Each tile opens its tab.
class _FamilyCards extends ConsumerWidget {
  const _FamilyCards();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider)!;
    final att = me.hasModule('attendance') ? ref.watch(myAttendanceProvider(isoMonth(DateTime.now()))) : null;
    final fees = me.hasModule('fees') ? ref.watch(myFeesProvider) : null;
    final homework = me.hasModule('academics') ? ref.watch(myHomeworkProvider).value : null;
    final kids = att?.value ?? const <StudentAttendance>[];
    final feeKids = fees?.value?.children ?? const <ChildFees>[];
    if ((att?.isLoading ?? false) || (fees?.isLoading ?? false)) return const SkeletonList(count: 1, height: 120, padding: EdgeInsets.only(bottom: 10));
    final all = _familyChildren(ref);
    if (all.isEmpty) return const SizedBox.shrink();
    final allIds = [for (final k in all) k.$1];
    // With more than one child: a row of the children to choose from, and the chosen child's day below it. The same
    // child is then shown on the Attendance, Homework, Fees and Results tabs.
    final chosen = all.length > 1 ? allIds[childIndex(ref, allIds)] : null;
    final ids = {for (final (id, name) in all) if (chosen == null || id == chosen) id: name};
    // Keep the home-screen widget in step with what Home shows (the chosen child first).
    WidgetsBinding.instance.addPostFrameCallback((_) => updateTodayWidget(
          attendance: [...kids.where((k) => k.studentId == chosen), ...kids.where((k) => k.studentId != chosen)],
          fees: [...feeKids.where((k) => k.studentId == chosen), ...feeKids.where((k) => k.studentId != chosen)],
        ));
    final today = DateTime.now();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (chosen != null)
          _ChildChips(
            children: all,
            chosen: chosen,
            onChosen: (id) => selectChild(ref, allIds, allIds.indexOf(id)),
            subtitle: (id) => (kids.where((k) => k.studentId == id).firstOrNull?.classSection ?? feeKids.where((f) => f.studentId == id).firstOrNull?.classSection) ?? '',
          ),
        for (final entry in ids.entries)
          Builder(
            builder: (context) {
              final s = statusColors(context);
              final a = kids.where((k) => k.studentId == entry.key).firstOrNull;
              final f = feeKids.where((k) => k.studentId == entry.key).firstOrNull;
              final mark = a?.on(today);
              final todo = homework?.where((h) => h.studentId == entry.key && h.status == 'pending').toList();
              final dueToday = todo?.where((h) => DateUtils.isSameDay(h.dueDate, today)).length ?? 0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (chosen == null) ...[
                      _ChildRow(name: entry.value, section: a?.classSection ?? f?.classSection ?? ''),
                      const SizedBox(height: 10),
                    ],
                    if (a != null)
                      _BentoTile(
                        tone: PastelTone.mint,
                        onTap: () => context.go('/attendance'),
                        child: Row(
                          children: [
                            PercentRing(value: a.monthPercent, size: 64, label: 'month'),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const _TileLabel('Today'),
                                  _TileValue(
                                    mark == null
                                        ? (today.weekday == 7 || ref.watch(schoolClosedTodayProvider).value != null ? 'Holiday' : 'Not marked yet')
                                        : statusMeta[mark.status]!.label,
                                    color: mark == null ? null : statusColor(context, mark.status),
                                  ),
                                  const _TileHint('Attendance this month'),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (a != null && (f != null || todo != null)) const SizedBox(height: 10),
                    // Both tiles the same height, whatever wraps in either (big phone fonts).
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (f != null)
                            Expanded(
                              child: _BentoTile(
                                tone: PastelTone.peach,
                                icon: Icons.account_balance_wallet_outlined,
                                onTap: () => context.go('/fees'),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _TileLabel(f.overdue > 0 ? 'Fees overdue' : 'Fees due'),
                                    _TileValue(f.overdue > 0 ? inr(f.overdue) : (f.due > 0 ? inr(f.due) : 'Paid up'), color: f.overdue > 0 ? s.danger : null),
                                    _TileHint(f.overdue > 0 ? 'Please pay soon' : (f.due > 0 ? 'Pay at the office' : 'Thank you')),
                                  ],
                                ),
                              ),
                            ),
                          if (f != null && todo != null) const SizedBox(width: 10),
                          if (todo != null)
                            Expanded(
                              child: _BentoTile(
                                tone: PastelTone.lavender,
                                icon: Icons.menu_book_outlined,
                                onTap: () => context.go('/homework'),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const _TileLabel('Homework'),
                                    _TileValue(todo.isEmpty ? 'All done' : '${todo.length} to do'),
                                    _TileHint(dueToday > 0 ? '$dueToday due today' : (todo.isEmpty ? 'Nothing pending' : 'Nothing due today')),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }
}

/// A family's children to choose from on Home: initials on a soft tile, first name and class. The chosen one is filled.
class _ChildChips extends StatelessWidget {
  const _ChildChips({required this.children, required this.chosen, required this.onChosen, required this.subtitle});
  final List<(String, String)> children;
  final String chosen;
  final ValueChanged<String> onChosen;
  final String Function(String id) subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final b = Theme.of(context).brightness;
    final dark = b == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final (id, name) in children)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Semantics(
                  selected: id == chosen,
                  button: true,
                  label: '$name, ${subtitle(id)}',
                  excludeSemantics: true,
                  child: Material(
                    color: id == chosen ? (dark ? const Color(0xFFF4F1EB) : const Color(0xFF1E2033)) : scheme.surfaceContainerLowest,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                      side: id == chosen ? BorderSide.none : BorderSide(color: scheme.outlineVariant),
                    ),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => onChosen(id),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 14, 8),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 34,
                              height: 34,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: PastelTone.sky.bg(b), borderRadius: BorderRadius.circular(11)),
                              child: Text(
                                name.split(' ').where((p) => p.isNotEmpty).map((p) => p[0]).take(2).join(),
                                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: PastelTone.sky.fg(b)),
                              ),
                            ),
                            const SizedBox(width: 9),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  name.split(' ').first,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 14.5,
                                    color: id == chosen ? (dark ? const Color(0xFF1E2033) : Colors.white) : scheme.onSurface,
                                  ),
                                ),
                                if (subtitle(id).isNotEmpty)
                                  Text(
                                    subtitle(id),
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: id == chosen ? (dark ? const Color(0xFF55576A) : const Color(0xCCFFFFFF)) : scheme.onSurfaceVariant,
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A child's initials and name above their tiles.
class _ChildRow extends StatelessWidget {
  const _ChildRow({required this.name, required this.section});
  final String name;
  final String section;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final b = Theme.of(context).brightness;
    return Row(
      children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: PastelTone.sky.bg(b), borderRadius: BorderRadius.circular(12)),
          child: Text(
            name.split(' ').where((p) => p.isNotEmpty).map((p) => p[0]).take(2).join(),
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: PastelTone.sky.fg(b)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              if (section.isNotEmpty) Text(section, style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
      ],
    );
  }
}

/// One soft-coloured tile of Home's bento (theme 5), with an optional icon square above its words.
class _BentoTile extends StatelessWidget {
  const _BentoTile({required this.tone, required this.child, required this.onTap, this.icon});
  final PastelTone tone;
  final Widget child;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).brightness;
    return Pressable(
      child: Material(
        color: tone.bg(b),
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: DefaultTextStyle.merge(
            style: TextStyle(color: tone.fg(b)),
            child: IconTheme.merge(
              data: IconThemeData(color: tone.fg(b)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (icon != null) ...[
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(color: tone.tile(b), borderRadius: BorderRadius.circular(12)),
                        child: Icon(icon, size: 19),
                      ),
                      const SizedBox(height: 10),
                    ],
                    child,
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TileLabel extends StatelessWidget {
  const _TileLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Opacity(opacity: 0.85, child: Text(text, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)));
}

class _TileValue extends StatelessWidget {
  const _TileValue(this.text, {this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(
        text,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.4, height: 1.2, color: color),
      );
}

class _TileHint extends StatelessWidget {
  const _TileHint(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Opacity(opacity: 0.8, child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)));
}

/// Your initials on a peach tile, beside the greeting.
class _Initials extends StatelessWidget {
  const _Initials(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        width: 48,
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFD9B8), Color(0xFFFFB98A)]),
        ),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Color(0xFF7A3A10))),
      );
}

/// The most used screens beyond the tab bar as colourful tiles (theme 5): picked from what this person can open on
/// the More screen (their role, permissions and the school's modules), so a shortcut is never one they can't use.
class _Shortcuts extends ConsumerWidget {
  const _Shortcuts();

  // route -> short name and its two gradient colours, in the order they are offered.
  static const _style = <String, (String, Color, Color)>{
    '/my-class': ('My class', Color(0xFFFF9A62), Color(0xFFF2643A)),
    '/timetable': ('Timetable', Color(0xFF9B7BFF), Color(0xFF6D3FE0)),
    '/results': ('Results', Color(0xFFFFC94D), Color(0xFFF09A0E)),
    '/marks': ('Marks', Color(0xFFFFC94D), Color(0xFFF09A0E)),
    '/bus': ('Bus', Color(0xFFFF9A62), Color(0xFFF2643A)),
    '/notices': ('Notices', Color(0xFF3DD9C9), Color(0xFF13A7B5)),
    '/leave': ('Leave', Color(0xFFFF7A9A), Color(0xFFE8456B)),
    '/messages': ('Messages', Color(0xFF5AA2FF), Color(0xFF3366F0)),
    '/my-hr': ('Leave & pay', Color(0xFF4BDB95), Color(0xFF17A865)),
    '/calendar': ('Calendar', Color(0xFF7BE3C2), Color(0xFF25B48A)),
    '/tests': ('Tests', Color(0xFF8C8CF8), Color(0xFF4F46E5)),
    '/live': ('Live classes', Color(0xFFFF7A9A), Color(0xFFE8456B)),
    '/ptm': ('Meetings', Color(0xFF3DD9C9), Color(0xFF13A7B5)),
    '/my-library': ('Library', Color(0xFFFFC94D), Color(0xFFF09A0E)),
    '/gate-pass': ('Gate pass', Color(0xFFFF9A62), Color(0xFFF2643A)),
    '/syllabus': ('Syllabus', Color(0xFF4BDB95), Color(0xFF17A865)),
    '/surveys': ('Surveys', Color(0xFF5AA2FF), Color(0xFF3366F0)),
    '/gate': ('Gate desk', Color(0xFFFF9A62), Color(0xFFF2643A)),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final links = {for (final l in moreLinks(ref)) l.$4: l};
    final picked = [for (final route in _style.keys) ?links[route]].take(8).toList();
    if (picked.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Heading('Shortcuts'),
        LayoutBuilder(
          builder: (context, c) {
            final w = (c.maxWidth - 3 * 6) / 4;
            return Wrap(
              spacing: 6,
              runSpacing: 14,
              children: [
                for (final (icon, _, _, route, _) in picked)
                  SizedBox(
                    width: w,
                    child: Pressable(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: () => context.push(route),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Column(
                            children: [
                              Container(
                                width: 54,
                                height: 54,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(20),
                                  gradient: LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [_style[route]!.$2, _style[route]!.$3],
                                  ),
                                  boxShadow: [BoxShadow(color: _style[route]!.$3.withValues(alpha: 0.35), blurRadius: 14, spreadRadius: -6, offset: const Offset(0, 8))],
                                ),
                                child: Icon(icon, color: Colors.white, size: 24),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _style[route]!.$1,
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, height: 1.2),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
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
                    maxLines: 3,
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
    final chosen = _shownChild(ref);
    final todo = list.where((h) => h.status == 'pending' && (chosen == null || h.studentId == chosen)).toList()..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final many = chosen == null && {for (final h in list) h.studentId}.length > 1;
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
                        leading: _SubjectTile(color: subjectColors[h.color] ?? Theme.of(context).colorScheme.primary),
                        title: Text('${h.subject}: ${h.title}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
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
    final chosen = _shownChild(ref);
    final v = views.where((x) => x.studentId != null && x.studentId == chosen).firstOrNull ?? views.first;
    final closed = ref.watch(schoolClosedTodayProvider).value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading(
          views.length > 1 && chosen == null ? "Today · ${v.title}" : (v.kind == 'teacher' ? "Today's classes" : "Today's lessons"),
          action: 'Week',
          onAction: () => context.push('/timetable'),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            // A holiday: no lessons today (the week is one tap away).
            child: closed != null
                ? Padding(padding: const EdgeInsets.all(16), child: ClosedNote(reason: closed))
                : DayLessons(view: v, day: DateTime.now().weekday, compact: true),
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
    if (ref.watch(schoolClosedTodayProvider).value != null) return const SizedBox.shrink(); // a holiday: no attendance
    final pending = list.where((s) => !s.done).toList();
    final s = statusColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading('Attendance today', action: 'All classes', onAction: () => context.go('/attendance')),
        if (pending.isNotEmpty)
          // Classes still to mark: the coral card with white Mark buttons (theme 5), the one thing to do first.
          Theme(
            data: AppTheme.onInk,
            child: HeroCard(
              scheme: Theme.of(context).colorScheme,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  children: [
                    for (final c in pending.take(4))
                      ListTile(
                        leading: const Icon(Icons.fact_check_outlined, color: Colors.white),
                        title: Text(c.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${c.students} students${c.isClassTeacher ? ' · your class' : ''} · not taken yet', style: const TextStyle(color: Color(0xE6FFFFFF))),
                        trailing: FilledButton(
                          onPressed: () async {
                            await context.push('/attendance/mark/${c.sectionId}?date=$day&label=${Uri.encodeComponent(c.label)}');
                            ref.invalidate(attendanceSectionsProvider(day));
                          },
                          style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Colors.white, foregroundColor: const Color(0xFFD63B6A)),
                          child: const Text('Mark'),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          )
        else
          Card(
          child: Column(
            children: [
              ListTile(
                leading: Icon(Icons.check_circle_rounded, color: s.success),
                title: const Text('All your classes are marked'),
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
        IntrinsicHeight(
          child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
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
        ),
      ],
    );
  }
}

/// Home's summary card (theme 4): the website's blue gradient banner with its two soft lights and a faint drawing of a
/// school. [scheme] is the screen's own colours (the card's contents are usually drawn in the dark theme).
class HeroCard extends StatelessWidget {
  const HeroCard({super.key, required this.scheme, required this.child, this.margin = EdgeInsets.zero});
  final ColorScheme scheme;
  final Widget child;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    final deco = AppTheme.heroDecoration(scheme);
    return Padding(
      padding: margin,
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: deco.borderRadius, boxShadow: deco.boxShadow),
        child: ClipRRect(
          borderRadius: deco.borderRadius!,
          child: Material(
            type: MaterialType.transparency,
            child: Ink(
              decoration: BoxDecoration(gradient: deco.gradient),
              child: Stack(
                children: [
                  Positioned.fill(child: AppTheme.heroLights()),
                  Positioned(
                    right: -40,
                    bottom: -52,
                    child: ExcludeSemantics(child: Opacity(opacity: 0.08, child: SvgPicture.asset('assets/hero/school-lines.svg', width: 170))),
                  ),
                  child,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A rounded tile in the subject's colour, for a homework row.
class _SubjectTile extends StatelessWidget {
  const _SubjectTile({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
        child: Icon(Icons.menu_book_rounded, size: 20, color: color),
      );
}
