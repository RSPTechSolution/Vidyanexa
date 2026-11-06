import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';

class Period {
  Period.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        start = (j['start_time'] as String).substring(0, 5),
        end = (j['end_time'] as String).substring(0, 5),
        isBreak = j['is_break'] as bool;
  final String id;
  final String name;
  final String start;
  final String end;
  final bool isBreak;

  int get startMinutes => int.parse(start.split(':')[0]) * 60 + int.parse(start.split(':')[1]);
  int get endMinutes => int.parse(end.split(':')[0]) * 60 + int.parse(end.split(':')[1]);
}

class Lesson {
  Lesson.fromJson(Map<String, dynamic> j)
      : day = j['day'] as int,
        periodId = j['period_id'] as String,
        sectionLabel = j['section_label'] as String,
        subject = j['subject_name'] as String,
        color = j['subject_color'] as String,
        teacher = j['teacher_name'] as String?,
        room = j['room'] as String?;
  final int day;
  final String periodId;
  final String sectionLabel;
  final String subject;
  final String color;
  final String? teacher;
  final String? room;
}

class TimetableView {
  TimetableView.fromJson(Map<String, dynamic> j)
      : title = j['title'] as String,
        subtitle = j['subtitle'] as String?,
        kind = j['kind'] as String,
        periods = [for (final p in (j['periods'] as List).cast<Map>()) Period.fromJson(p.cast())],
        lessons = [for (final e in (j['entries'] as List).cast<Map>()) Lesson.fromJson(e.cast())];
  final String title;
  final String? subtitle;
  final String kind;
  final List<Period> periods;
  final List<Lesson> lessons;

  Lesson? at(int day, String periodId) {
    for (final l in lessons) {
      if (l.day == day && l.periodId == periodId) return l;
    }
    return null;
  }
}

final myTimetablesProvider = FutureProvider.autoDispose<List<TimetableView>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<TimetableView>>('/timetable/my',
      parse: (d) => [for (final x in (d as List).cast<Map>()) TimetableView.fromJson(x.cast())]);
  return res.data;
});

/// Why the school is closed today (a holiday or vacation on the school calendar), or null on a school day.
final schoolClosedTodayProvider = FutureProvider.autoDispose<String?>((ref) async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final res = await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/calendar',
      query: {'from': today, 'to': today}, parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()]);
  final off = res.data.where((e) => e['kind'] == 'holiday' || e['kind'] == 'vacation');
  return off.isEmpty ? null : off.first['title'] as String;
});

const subjectColors = {
  'blue': Color(0xFF2563EB), 'green': Color(0xFF059669), 'amber': Color(0xFFD97706), 'rose': Color(0xFFE11D48),
  'violet': Color(0xFF7C3AED), 'teal': Color(0xFF0D9488), 'orange': Color(0xFFEA580C), 'sky': Color(0xFF0284C7),
  'lime': Color(0xFF65A30D), 'pink': Color(0xFFDB2777), 'slate': Color(0xFF475569), 'indigo': Color(0xFF4F46E5),
};

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class TimetableScreen extends ConsumerStatefulWidget {
  const TimetableScreen({super.key});
  @override
  ConsumerState<TimetableScreen> createState() => _TimetableScreenState();
}

class _TimetableScreenState extends ConsumerState<TimetableScreen> {
  int view = 0;
  int day = DateTime.now().weekday.clamp(1, 6);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myTimetablesProvider);
    final closed = ref.watch(schoolClosedTodayProvider).value;
    return Scaffold(
      appBar: AppBar(title: const Text('Timetable')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myTimetablesProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(count: 7),
          onRetry: () => ref.invalidate(myTimetablesProvider),
          builder: (views) {
            if (views.isEmpty) return ListView(children: const [EmptyPanel(icon: Icons.calendar_month_outlined, title: 'No timetable yet')]);
            final v = views[view.clamp(0, views.length - 1)];
            return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
              const SizedBox(height: 8),
              ChildSwitcher(names: [for (final x in views) x.title], subtitles: [for (final x in views) x.subtitle ?? ''], index: view, onChanged: (i) => setState(() => view = i)),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: [for (var d = 1; d <= 6; d++) ButtonSegment(value: d, label: Text(dayNames[d - 1]))],
                  selected: {day},
                  onSelectionChanged: (s) => setState(() => day = s.first),
                ),
              ),
              if (day == DateTime.now().weekday && closed != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: ClosedNote(reason: closed),
                ),
              DayLessons(view: v, day: day, closedToday: closed != null),
            ]);
          },
        ),
      ),
    );
  }
}

/// "School closed today: Guru Nanak Jayanti".
class ClosedNote extends StatelessWidget {
  const ClosedNote({super.key, required this.reason});
  final String reason;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(children: [
      Icon(Icons.lock_outline, size: 18, color: scheme.onSurfaceVariant),
      const SizedBox(width: 8),
      Expanded(child: Text('School closed today: $reason', style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600))),
    ]);
  }
}

/// One day's periods as a list. Used on the Timetable tab and the home screen.
class DayLessons extends StatelessWidget {
  const DayLessons({super.key, required this.view, required this.day, this.compact = false, this.closedToday = false});
  final TimetableView view;
  final int day;
  final bool compact;

  /// Today is a holiday: no period is shown as "Now".
  final bool closedToday;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final nowMin = now.hour * 60 + now.minute;
    final isToday = now.weekday == day && !closedToday;
    // Stop after the day's last lesson (Saturdays and pre-primary are half days).
    final last = view.periods.lastIndexWhere((p) => view.at(day, p.id) != null);
    final rows = [
      for (final (i, p) in view.periods.indexed)
        if (i <= last && (!compact || (!p.isBreak && view.at(day, p.id) != null))) p,
    ];
    if (compact && rows.isEmpty) {
      return Padding(padding: const EdgeInsets.all(16), child: Text(day == 7 ? 'No classes on Sunday.' : 'No lessons today.', style: TextStyle(color: scheme.onSurfaceVariant)));
    }
    return Column(children: [
      for (final p in rows)
        if (p.isBreak)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            child: Row(children: [
              SizedBox(width: 52, child: Text(p.start, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant))),
              Icon(Icons.free_breakfast_outlined, size: 16, color: scheme.onSurfaceVariant),
              const SizedBox(width: 6),
              Text(p.name, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
            ]),
          )
        else
          Builder(builder: (context) {
            final l = view.at(day, p.id);
            final live = isToday && p.startMinutes <= nowMin && nowMin < p.endMinutes;
            final color = l == null ? scheme.outline : subjectColors[l.color] ?? scheme.primary;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                  width: 52,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(p.start, style: TextStyle(fontSize: 12, fontWeight: live ? FontWeight.w800 : FontWeight.normal, color: live ? scheme.primary : scheme.onSurfaceVariant)),
                  ),
                ),
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: l == null ? null : color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(14),
                      // Flutter can only round a border whose sides share one colour: the subject's colour on the left, or
                      // all round in the accent for the period on now.
                      border: live ? Border.all(color: scheme.primary, width: 2) : Border(left: BorderSide(color: color, width: 4)),
                    ),
                    child: l == null
                        ? Text('${p.name} · free', style: TextStyle(color: scheme.onSurfaceVariant))
                        : Row(children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(l.subject, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text(
                                  [view.kind == 'teacher' ? l.sectionLabel : (l.teacher ?? 'Teacher to be assigned'), if (l.room != null) l.room!].join(' · '),
                                  style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                                ),
                              ]),
                            ),
                            if (live) Pill('Now', color: scheme.primary),
                          ]),
                  ),
                ),
              ]),
            );
          }),
    ]);
  }
}
