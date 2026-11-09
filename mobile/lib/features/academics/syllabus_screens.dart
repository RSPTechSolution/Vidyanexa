import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';
import '../timetable/timetable_screen.dart' show subjectColors;

class Coverage {
  Coverage.fromJson(Map<String, dynamic> j)
      : subject = j['subject_name'] as String,
        color = j['subject_color'] as String,
        total = (j['total'] as num).toInt(),
        done = (j['done'] as num).toInt(),
        percent = (j['percent'] as num?)?.toDouble() ?? 0,
        behind = (j['behind'] as num).toInt(),
        lastTopic = j['last_topic'] as String?;
  final String subject;
  final String color;
  final int total;
  final int done;
  final double percent;
  final int behind;
  final String? lastTopic;
}

class ChildSyllabus {
  ChildSyllabus.fromJson(Map<String, dynamic> j)
      : name = j['name'] as String,
        classSection = j['class_section'] as String,
        subjects = [for (final s in (j['subjects'] as List).cast<Map>()) Coverage.fromJson(s.cast())];
  final String name;
  final String classSection;
  final List<Coverage> subjects;
}

final mySyllabusProvider = FutureProvider.autoDispose<List<ChildSyllabus>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<ChildSyllabus>>('/syllabus/my',
      parse: (d) => [for (final x in (d as List).cast<Map>()) ChildSyllabus.fromJson(x.cast())]);
  return res.data;
});

/// Families: how far each subject's syllabus has got.
class MySyllabusScreen extends ConsumerWidget {
  const MySyllabusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mySyllabusProvider);
    final scheme = Theme.of(context).colorScheme;
    final s = statusColors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Syllabus')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(mySyllabusProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(count: 4),
          onRetry: () => ref.invalidate(mySyllabusProvider),
          builder: (kids) => kids.isEmpty
              ? ListView(children: const [EmptyPanel(icon: Icons.menu_book_outlined, title: 'Nothing to show yet')])
              : ListView(padding: const EdgeInsets.all(16), children: [
                  for (final k in kids) ...[
                    Text(k.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    Text(k.classSection, style: TextStyle(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 10),
                    if (k.subjects.isEmpty)
                      const Card(child: Padding(padding: EdgeInsets.all(16), child: Text("The teachers haven't shared the syllabus yet."))),
                    for (final c in k.subjects)
                      Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Container(width: 10, height: 10, decoration: BoxDecoration(color: subjectColors[c.color] ?? scheme.primary, shape: BoxShape.circle)),
                              const SizedBox(width: 8),
                              Expanded(child: Text(c.subject, style: const TextStyle(fontWeight: FontWeight.w700))),
                              Text('${c.percent.toStringAsFixed(c.percent % 1 == 0 ? 0 : 1)}%', style: const TextStyle(fontWeight: FontWeight.w800)),
                            ]),
                            const SizedBox(height: 8),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: LinearProgressIndicator(
                                value: c.total == 0 ? 0 : c.done / c.total,
                                minHeight: 8,
                                semanticsLabel: '${c.subject} syllabus covered',
                                color: c.percent >= 75 ? s.success : c.percent >= 40 ? scheme.primary : s.warning,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text('${c.done} of ${c.total} topics${c.behind > 0 ? ' · ${c.behind} behind plan' : ''}',
                                style: TextStyle(fontSize: 12, color: c.behind > 0 ? s.warning : scheme.onSurfaceVariant)),
                            if (c.lastTopic != null)
                              Text('Latest: ${c.lastTopic}', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                          ]),
                        ),
                      ),
                    const SizedBox(height: 16),
                  ],
                ]),
        ),
      ),
    );
  }
}

class Cover {
  Cover.fromJson(Map<String, dynamic> j)
      : date = DateTime.parse(j['date'] as String),
        period = j['period_name'] as String,
        start = j['start_time'] as String,
        section = j['section_label'] as String,
        subject = j['subject_name'] as String,
        forTeacher = j['absent_teacher'] as String?,
        note = j['note'] as String?;
  final DateTime date;
  final String period;
  final String start;
  final String section;
  final String subject;
  final String? forTeacher;
  final String? note;
}

final myCoversProvider = FutureProvider.autoDispose<List<Cover>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<Cover>>('/substitutions/mine',
      parse: (d) => [for (final x in (d as List).cast<Map>()) Cover.fromJson(x.cast())]);
  return res.data;
});

/// Teachers' home screen: periods they are covering for absent colleagues.
class CoversCard extends ConsumerWidget {
  const CoversCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final covers = ref.watch(myCoversProvider).value ?? const [];
    if (covers.isEmpty) return const SizedBox.shrink();
    final s = statusColors(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        color: s.warning.withValues(alpha: 0.08),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.swap_horiz_rounded, color: s.warning),
              const SizedBox(width: 8),
              const Text('Your covers', style: TextStyle(fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 8),
            for (final c in covers)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text('${DateFormat('EEE d MMM').format(c.date)} · ${c.period} (${c.start}) · ${c.section} ${c.subject}'
                    '${c.forTeacher != null ? ' for ${c.forTeacher}' : ''}'),
              ),
          ]),
        ),
      ),
    );
  }
}
