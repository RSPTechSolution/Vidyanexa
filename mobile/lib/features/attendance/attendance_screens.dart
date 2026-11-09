import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';
import 'attendance_data.dart';

Color statusColor(BuildContext context, String status) {
  final s = statusColors(context);
  return switch (status) {
    'present' => s.success,
    'absent' => s.danger,
    'late' => s.warning,
    'half_day' => s.info,
    _ => Theme.of(context).colorScheme.onSurfaceVariant,
  };
}

/// The Attendance tab: a calendar for parents and students, classes to mark for staff.
class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    if (me == null) return const SizedBox.shrink();
    return me.isFamily ? const FamilyAttendanceView() : const SectionsView();
  }
}

// ---- parents & students --------------------------------------------------------------------------

class FamilyAttendanceView extends ConsumerStatefulWidget {
  const FamilyAttendanceView({super.key});
  @override
  ConsumerState<FamilyAttendanceView> createState() => _FamilyAttendanceViewState();
}

class _FamilyAttendanceViewState extends ConsumerState<FamilyAttendanceView> {
  DateTime month = DateTime(DateTime.now().year, DateTime.now().month);
  int child = 0;

  @override
  Widget build(BuildContext context) {
    final key = isoMonth(month);
    final async = ref.watch(myAttendanceProvider(key));
    final now = DateTime.now();
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myAttendanceProvider(key).future),
        child: AsyncView(
          value: async,
          loading: const SkeletonSummary(),
          onRetry: () => ref.invalidate(myAttendanceProvider(key)),
          builder: (list) {
            if (list.isEmpty) {
              return ListView(
                children: const [
                  EmptyPanel(
                    icon: Icons.family_restroom_rounded,
                    title: 'Nothing to show yet',
                    message: 'No student is linked to this account. Please contact the school office.',
                  ),
                ],
              );
            }
            final a = list[child.clamp(0, list.length - 1)];
            final away = a.days.where((d) => d.status != 'present').toList();
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const SizedBox(height: 8),
                ChildSwitcher(
                  names: [for (final x in list) x.name],
                  subtitles: [for (final x in list) x.classSection],
                  index: child,
                  onChanged: (i) => setState(() => child = i),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          PercentRing(value: a.yearPercent, size: 110),
                          const SizedBox(width: 18),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(a.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                Text(a.classSection, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                                const SizedBox(height: 10),
                                Row(children: [Text('${DateFormat('MMMM').format(month)}  '), PercentPill(a.monthPercent)]),
                                const SizedBox(height: 6),
                                Text(
                                  '${a.yearCounts['absent']} absent · ${a.yearCounts['late']} late this year',
                                  style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (a.yearPercent != null && a.yearPercent! < 75)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Card(
                      color: statusColors(context).danger.withValues(alpha: 0.1),
                      child: const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text('Attendance is below the 75% most boards require to sit exams. Please speak to the class teacher.'),
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: MonthGrid(
                        month: month,
                        data: a,
                        canGoNext: month.isBefore(DateTime(now.year, now.month)),
                        onChange: (m) => setState(() => month = m),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 6),
                  child: Text('Days away this month', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                ),
                if (away.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Text('Present every day so far.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  )
                else
                  for (final d in away)
                    ListTile(
                      leading: CircleAvatar(
                        backgroundColor: statusColor(context, d.status).withValues(alpha: 0.12),
                        child: Icon(statusMeta[d.status]!.icon, color: statusColor(context, d.status), size: 20),
                      ),
                      title: Text(DateFormat('EEEE, d MMM').format(d.date)),
                      subtitle: Text([statusMeta[d.status]!.label, if (d.remark != null) d.remark!].join(' · ')),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// A month of attendance as a calendar, Monday first.
class MonthGrid extends StatelessWidget {
  const MonthGrid({super.key, required this.month, required this.data, required this.onChange, required this.canGoNext});
  final DateTime month;
  final StudentAttendance data;
  final ValueChanged<DateTime> onChange;
  final bool canGoNext;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final days = DateUtils.getDaysInMonth(month.year, month.month);
    final lead = (DateTime(month.year, month.month).weekday - 1) % 7;
    final today = DateTime.now();
    return Column(
      children: [
        Row(
          children: [
            IconButton(tooltip: 'Previous month', onPressed: () => onChange(DateTime(month.year, month.month - 1)), icon: const Icon(Icons.chevron_left)),
            Expanded(
              child: Text(
                DateFormat('MMMM yyyy').format(month),
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
            IconButton(
              tooltip: 'Next month',
              onPressed: canGoNext ? () => onChange(DateTime(month.year, month.month + 1)) : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        Row(
          children: [
            for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
              Expanded(
                child: Center(
                  child: Text(d, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          children: [
            for (var i = 0; i < lead; i++) const SizedBox.shrink(),
            for (var d = 1; d <= days; d++)
              _DayCell(date: DateTime(month.year, month.month, d), mark: data.on(DateTime(month.year, month.month, d)), today: today),
          ],
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.date, required this.mark, required this.today});
  final DateTime date;
  final DayMark? mark;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isToday = DateUtils.isSameDay(date, today);
    final color = mark == null ? null : statusColor(context, mark!.status);
    final label =
        '${DateFormat('EEEE d MMMM').format(date)}: ${mark == null ? (date.weekday == 7 ? 'Sunday' : 'not marked') : statusMeta[mark!.status]!.label}';
    return Semantics(
      label: label,
      child: Container(
        decoration: BoxDecoration(
          color: color?.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isToday ? scheme.primary : (color ?? scheme.outline).withValues(alpha: mark == null ? 0.5 : 0.4),
            width: isToday ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '${date.day}',
              style: TextStyle(fontWeight: FontWeight.w600, color: date.weekday == 7 ? scheme.onSurfaceVariant.withValues(alpha: 0.5) : color),
            ),
            if (mark != null) Icon(statusMeta[mark!.status]!.icon, size: 12, color: color),
          ],
        ),
      ),
    );
  }
}

// ---- staff ---------------------------------------------------------------------------------------

class SectionsView extends ConsumerStatefulWidget {
  const SectionsView({super.key});
  @override
  ConsumerState<SectionsView> createState() => _SectionsViewState();
}

class _SectionsViewState extends ConsumerState<SectionsView> {
  int back = 0; // days before today

  @override
  Widget build(BuildContext context) {
    final day = isoDay(DateTime.now().subtract(Duration(days: back)));
    final async = ref.watch(attendanceSectionsProvider(day));
    final me = ref.watch(meProvider)!;
    return Scaffold(
      appBar: AppBar(title: Text(me.can('attendance.mark') ? 'Take attendance' : 'Attendance')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(attendanceSectionsProvider(day).future),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: SegmentedButton<int>(
                segments: [
                  ButtonSegment(value: 0, label: segmentLabel('Today')),
                  ButtonSegment(value: 1, label: segmentLabel('Yesterday')),
                  ButtonSegment(value: 2, label: segmentLabel(DateFormat('EEE d').format(DateTime.now().subtract(const Duration(days: 2))))),
                ],
                selected: {back},
                onSelectionChanged: (s) => setState(() => back = s.first),
              ),
            ),
            AsyncView(
              value: async,
              loading: const SkeletonList(count: 4, lines: 3),
              onRetry: () => ref.invalidate(attendanceSectionsProvider(day)),
              builder: (list) {
                if (list.isEmpty) {
                  return const EmptyPanel(
                    icon: Icons.fact_check_outlined,
                    title: 'No classes to mark',
                    message: 'Only the class teacher (incharge) of a class takes its daily attendance. Ask your school admin to make you the class teacher of a section.',
                  );
                }
                final pending = list.where((s) => !s.done).length;
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Pill(
                          pending == 0 ? 'All classes marked' : '$pending class${pending > 1 ? 'es' : ''} left to mark',
                          color: pending == 0 ? statusColors(context).success : statusColors(context).warning,
                          icon: pending == 0 ? Icons.check_circle : Icons.pending_actions,
                        ),
                      ),
                    ),
                    for (final (i, s) in list.indexed)
                      TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0, end: 1),
                        duration: Duration(milliseconds: 250 + 40 * i.clamp(0, 10)),
                        curve: Curves.easeOutCubic,
                        builder: (context, t, child) => Opacity(
                          opacity: t,
                          child: Transform.translate(offset: Offset(0, 12 * (1 - t)), child: child),
                        ),
                        child: _SectionTile(
                          s: s,
                          onTap: () async {
                            await context.push('/attendance/mark/${s.sectionId}?date=$day&label=${Uri.encodeComponent(s.label)}');
                            ref.invalidate(attendanceSectionsProvider(day));
                          },
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({required this.s, required this.onTap});
  final SectionCard s;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final st = statusColors(context);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: s.done ? scheme.outline : scheme.primary.withValues(alpha: 0.4)),
      ),
      child: Semantics(
        button: true,
        label:
            '${s.label}, ${s.done
                ? '${s.present} present, ${s.absent} absent'
                : s.marked > 0
                ? '${s.marked} of ${s.students} marked'
                : 'not marked, ${s.students} students'}',
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(color: (s.done ? st.success : scheme.primary).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                  child: Icon(s.done ? Icons.check_circle_rounded : Icons.fact_check_outlined, color: s.done ? st.success : scheme.primary),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text(
                        s.done
                            ? '${s.present} present · ${s.absent} absent${s.markedBy != null ? ' · ${s.markedBy}' : ''}'
                            : s.marked > 0
                            ? '${s.marked} of ${s.students} marked'
                            : '${s.students} students${s.isClassTeacher ? ' · your class' : ''}',
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: LinearProgressIndicator(
                          value: s.students == 0 ? 0 : s.marked / s.students,
                          minHeight: 5,
                          color: st.success,
                          backgroundColor: scheme.outline.withValues(alpha: 0.3),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MarkAttendanceScreen extends ConsumerStatefulWidget {
  const MarkAttendanceScreen({super.key, required this.sectionId, required this.date, required this.label});
  final String sectionId;
  final String date;
  final String label;

  @override
  ConsumerState<MarkAttendanceScreen> createState() => _MarkAttendanceScreenState();
}

class _MarkAttendanceScreenState extends ConsumerState<MarkAttendanceScreen> {
  Map<String, String?> marks = {};
  Map<String, String> remarks = {};
  bool loaded = false;
  bool saving = false;

  void _load(Roster r) {
    if (loaded) return;
    marks = {for (final s in r.students) s.studentId: s.status};
    remarks = {
      for (final s in r.students)
        if (s.remark != null) s.studentId: s.remark!,
    };
    loaded = true;
  }

  Future<void> _save(Roster r) async {
    setState(() => saving = true);
    final path = '/attendance/sections/${widget.sectionId}';
    final body = {
      'date': widget.date,
      'records': [
        for (final e in marks.entries)
          if (e.value != null) {'student_id': e.key, 'status': e.value, 'remark': (remarks[e.key] ?? '').trim().isEmpty ? null : remarks[e.key]!.trim()},
      ],
    };
    final absent = marks.values.where((v) => v == 'absent').length;
    try {
      await ref.read(apiClientProvider).put<Object?>(path, body: body);
      if (!mounted) return;
      showSnack(context, 'Attendance saved · $absent absent');
      Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // No connection: keep it on the phone and send it as soon as the app can reach the school again.
        await ref.read(apiClientProvider).sendLater('PUT', path, body, 'Attendance for ${r.label}');
        if (!mounted) return;
        showSnack(context, "You're offline. Attendance is saved on this phone and will be sent when you're back online.");
        Navigator.of(context).maybePop();
      } else if (mounted) {
        showSnack(context, e.message, error: true);
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _remark(RosterEntry s) async {
    final ctl = TextEditingController(text: remarks[s.studentId] ?? '');
    final v = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Reason for ${s.name.split(' ').first}'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          maxLength: 200,
          decoration: const InputDecoration(hintText: 'e.g. Fever, family function'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(c, ctl.text),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (v != null) setState(() => remarks[s.studentId] = v);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(rosterProvider((widget.sectionId, widget.date)));
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.label),
            Text(DateFormat('EEEE, d MMM').format(DateTime.parse(widget.date)), style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
          ],
        ),
        actions: [
          if (async.value?.editable == true)
            TextButton.icon(
              onPressed: () => setState(() => marks = {for (final e in marks.entries) e.key: e.value ?? 'present'}),
              icon: const Icon(Icons.done_all_rounded),
              label: const Text('Rest present'),
            ),
        ],
      ),
      body: AsyncView(
        value: async,
        loading: const SkeletonList(count: 10, lines: 1, gap: 6),
        onRetry: () => ref.invalidate(rosterProvider((widget.sectionId, widget.date))),
        builder: (r) {
          _load(r);
          return Column(
            children: [
              if (!r.editable)
                MaterialBanner(content: Text(r.lockedReason ?? 'Read only'), leading: const Icon(Icons.lock_outline), actions: const [SizedBox.shrink()]),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                  itemCount: r.students.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final s = r.students[i];
                    final st = marks[s.studentId];
                    final color = st == null ? scheme.outline : statusColor(context, st);
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: scheme.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: st == null ? scheme.outline : color.withValues(alpha: 0.5)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              SizedBox(
                                width: 26,
                                child: Text('${s.rollNo ?? '—'}', style: TextStyle(color: scheme.onSurfaceVariant)),
                              ),
                              CircleAvatar(
                                radius: 18,
                                backgroundColor: color.withValues(alpha: 0.15),
                                child: Text(
                                  s.name.split(' ').map((p) => p[0]).take(2).join(),
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: st == null ? scheme.onSurfaceVariant : color),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    Row(
                                      children: [
                                        Text('30 days ', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                                        PercentPill(s.recentPercent),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              if (st != null && st != 'present' && r.editable)
                                IconButton(
                                  tooltip: 'Add a reason',
                                  onPressed: () => _remark(s),
                                  icon: Icon(remarks[s.studentId]?.isNotEmpty == true ? Icons.sticky_note_2 : Icons.note_add_outlined, size: 20),
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              for (final k in statuses)
                                Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 2),
                                    child: _StatusButton(
                                      status: k,
                                      selected: st == k,
                                      enabled: r.editable,
                                      onTap: () {
                                        HapticFeedback.selectionClick();
                                        setState(() => marks[s.studentId] = k);
                                      },
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          if ((remarks[s.studentId] ?? '').isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text('Reason: ${remarks[s.studentId]}', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              if (r.editable) _SaveBar(marks: marks, saving: saving, onSave: () => _save(r)),
            ],
          );
        },
      ),
    );
  }
}

class _StatusButton extends StatelessWidget {
  const _StatusButton({required this.status, required this.selected, required this.enabled, required this.onTap});
  final String status;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(context, status);
    final m = statusMeta[status]!;
    return Semantics(
      label: m.label,
      selected: selected,
      button: true,
      child: AnimatedScale(
        scale: selected ? 1.0 : 0.94,
        duration: const Duration(milliseconds: 150),
        child: Material(
          color: selected ? color : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: selected ? color : Theme.of(context).colorScheme.outline),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: enabled ? onTap : null,
            child: SizedBox(
              height: 40,
              child: Center(
                child: Text(
                  m.short,
                  style: TextStyle(fontWeight: FontWeight.w800, color: selected ? Colors.white : Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SaveBar extends StatelessWidget {
  const _SaveBar({required this.marks, required this.saving, required this.onSave});
  final Map<String, String?> marks;
  final bool saving;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final count = {for (final s in statuses) s: marks.values.where((v) => v == s).length};
    final unmarked = marks.values.where((v) => v == null).length;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, -2))],
        ),
        child: Row(
          children: [
            Expanded(
              child: Wrap(
                spacing: 10,
                runSpacing: 2,
                children: [
                  for (final s in ['present', 'absent', 'late'])
                    Text(
                      '${statusMeta[s]!.label} ${count[s]}',
                      style: TextStyle(color: statusColor(context, s), fontWeight: FontWeight.w600),
                    ),
                  if (unmarked > 0)
                    Text(
                      '$unmarked left',
                      style: TextStyle(color: statusColors(context).warning, fontWeight: FontWeight.w600),
                    ),
                ],
              ),
            ),
            FilledButton.icon(
              onPressed: saving || unmarked == marks.length ? null : onSave,
              style: FilledButton.styleFrom(minimumSize: const Size(0, 46)),
              icon: saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.save_rounded),
              label: Text(saving ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    );
  }
}
