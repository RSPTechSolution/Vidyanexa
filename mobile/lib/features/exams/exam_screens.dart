import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/open_file.dart';
import '../timetable/timetable_screen.dart' show subjectColors;

final _day = DateFormat('EEE d MMM');
double? _d(Object? v) => (v as num?)?.toDouble();
String marks(double? v) => v == null ? '—' : (v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1));

String? gradeFor(double? pct) {
  if (pct == null) return null;
  for (final (floor, g) in [(91, 'A1'), (81, 'A2'), (71, 'B1'), (61, 'B2'), (51, 'C1'), (41, 'C2'), (33, 'D')]) {
    if (pct >= floor) return g;
  }
  return 'E';
}

class GradeChip extends StatelessWidget {
  const GradeChip(this.grade, {super.key});
  final String? grade;
  @override
  Widget build(BuildContext context) {
    final s = statusColors(context);
    final g = grade;
    if (g == null) return const Text('—');
    final color = g.startsWith('A')
        ? s.success
        : g.startsWith('B')
        ? Theme.of(context).colorScheme.primary
        : g.startsWith('C')
        ? s.info
        : g == 'D'
        ? s.warning
        : s.danger;
    return Pill(g, color: color);
  }
}

// ---- families: results ---------------------------------------------------------------------------

final myResultsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref
      .watch(apiClientProvider)
      .get<List<Map<String, dynamic>>>('/exams/my', parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()]);
  return res.data;
});

class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key});
  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  int child = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myResultsProvider);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Results')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myResultsProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonSummary(rows: 5),
          onRetry: () => ref.invalidate(myResultsProvider),
          builder: (kids) {
            if (kids.isEmpty) {
              return ListView(
                children: const [EmptyPanel(icon: Icons.emoji_events_outlined, title: 'Nothing to show yet')],
              );
            }
            final c = kids[child.clamp(0, kids.length - 1)];
            final exams = (c['exams'] as List).cast<Map>();
            final upcoming = (c['upcoming'] as List).cast<Map>();
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const SizedBox(height: 8),
                ChildSwitcher(
                  names: [for (final k in kids) k['name'] as String],
                  subtitles: [for (final k in kids) k['class_section'] as String],
                  index: child,
                  onChanged: (i) => setState(() => child = i),
                ),
                if (exams.isEmpty) const EmptyPanel(icon: Icons.emoji_events_outlined, title: 'No results published yet'),
                for (final e in exams)
                  Card(
                    margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => context.push('/results/${e['exam_id']}/${c['student_id']}'),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 26,
                              backgroundColor: (e['passed'] == true ? statusColors(context).success : statusColors(context).warning).withValues(alpha: 0.12),
                              child: Icon(
                                (e['rank'] as int? ?? 99) <= 3 ? Icons.emoji_events_rounded : Icons.workspace_premium_outlined,
                                color: e['passed'] == true ? statusColors(context).success : statusColors(context).warning,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(e['exam_name'] as String, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                  if (e['rank'] != null) Text('Rank ${e['rank']} of ${e['class_size']}', style: TextStyle(color: scheme.onSurfaceVariant)),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(pct(_d(e['percent'])), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
                                GradeChip(e['grade'] as String?),
                              ],
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (upcoming.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 6),
                    child: Text('Upcoming exams', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  for (final p in upcoming)
                    ListTile(
                      dense: true,
                      leading: Icon(Icons.circle, size: 12, color: subjectColors[p['subject_color']] ?? scheme.primary),
                      title: Text(p['subject_name'] as String),
                      trailing: Text(p['exam_date'] == null ? 'TBA' : _day.format(DateTime.parse(p['exam_date'] as String))),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

final reportCardProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, (String, String)>((ref, a) async {
  final res = await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/exams/${a.$1}/report/${a.$2}', parse: (d) => (d as Map).cast());
  return res.data;
});

class ReportCardScreen extends ConsumerWidget {
  const ReportCardScreen({super.key, required this.examId, required this.studentId});
  final String examId;
  final String studentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reportCardProvider((examId, studentId)));
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Report card'),
        actions: [
          IconButton(
            tooltip: 'Open PDF',
            icon: const Icon(Icons.picture_as_pdf_outlined),
            onPressed: () => openApiFile(context, ref, '/exams/$examId/report/$studentId/pdf'),
          ),
        ],
      ),
      body: AsyncView(
        value: async,
        loading: const SkeletonDetail(rows: 8),
        onRetry: () => ref.invalidate(reportCardProvider((examId, studentId))),
        builder: (c) {
          final r = (c['result'] as Map).cast<String, dynamic>();
          final subjects = (r['subjects'] as List).cast<Map>();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: AppTheme.heroPanel(Theme.of(context).colorScheme)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${c['exam_name']} · ${c['academic_year']}', style: const TextStyle(color: Colors.white70)),
                    Text(
                      c['student_name'] as String,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                    ),
                    Text('${c['class_section']} · Roll ${c['roll_no'] ?? '—'}', style: const TextStyle(color: Colors.white70)),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        for (final (k, v) in [
                          ('Percentage', pct(_d(r['percent']))),
                          ('Grade', r['grade'] as String? ?? '—'),
                          ('Rank', r['rank'] == null ? '—' : '${r['rank']}/${c['class_size']}'),
                          ('Attendance', pct(_d(c['attendance_percent']))),
                        ])
                          Expanded(
                            child: Column(
                              children: [
                                Text(
                                  v,
                                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                                ),
                                Text(k, style: const TextStyle(color: Colors.white70, fontSize: 11)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Column(
                  children: [
                    for (final s in subjects)
                      ListTile(
                        title: Text(s['subject_name'] as String),
                        subtitle: Text('Pass ${marks(_d(s['pass_marks']))} of ${marks(_d(s['max_marks']))}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              s['absent'] == true ? 'Absent' : '${marks(_d(s['marks']))}/${marks(_d(s['max_marks']))}',
                              style: TextStyle(fontWeight: FontWeight.w700, color: s['passed'] == false ? statusColors(context).danger : null),
                            ),
                            const SizedBox(width: 10),
                            GradeChip(s['grade'] as String?),
                          ],
                        ),
                      ),
                    const Divider(height: 1),
                    ListTile(
                      title: const Text('Total', style: TextStyle(fontWeight: FontWeight.w800)),
                      trailing: Text('${marks(_d(r['total']))}/${marks(_d(r['max_total']))}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ],
                ),
              ),
              if (r['remark'] != null)
                Card(
                  child: ListTile(
                    leading: Icon(Icons.format_quote_rounded, color: scheme.primary),
                    title: Text(r['remark'] as String, style: const TextStyle(fontStyle: FontStyle.italic)),
                    subtitle: Text('Class teacher${c['class_teacher'] != null ? ' · ${c['class_teacher']}' : ''}'),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ---- teachers: mark entry ------------------------------------------------------------------------

final examsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref
      .watch(apiClientProvider)
      .get<List<Map<String, dynamic>>>('/exams', parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()]);
  return res.data;
});

final sheetsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, examId) async {
  final res = await ref
      .watch(apiClientProvider)
      .get<List<Map<String, dynamic>>>('/exams/$examId/marks-sheets', parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()]);
  return res.data;
});

const _statusLabel = {'draft': 'Draft', 'upcoming': 'Upcoming', 'ongoing': 'In progress', 'marks_entry': 'Marks entry', 'published': 'Results out'};

class MarksHomeScreen extends ConsumerWidget {
  const MarksHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(examsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Marks entry')),
      body: AsyncView(
        value: async,
        loading: const SkeletonList(),
        onRetry: () => ref.invalidate(examsProvider),
        builder: (exams) => exams.isEmpty
            ? const EmptyPanel(icon: Icons.edit_note_rounded, title: 'No exams yet')
            : ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  for (final e in exams)
                    Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ExpansionTile(
                        shape: const Border(),
                        initiallyExpanded: e['status'] == 'marks_entry' || e['status'] == 'ongoing',
                        title: Text(e['name'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                        // The counts are the whole school's: a teacher sees only the status here, and her own papers inside.
                        subtitle: Text(ref.watch(meProvider)?.role == 'teacher'
                            ? '${_statusLabel[e['status']] ?? e['status']}'
                            : '${_statusLabel[e['status']] ?? e['status']} · ${e['marks_entered']}/${e['marks_expected']} marks in'),
                        children: [_Sheets(examId: e['id'] as String)],
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _Sheets extends ConsumerWidget {
  const _Sheets({required this.examId});
  final String examId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sheetsProvider(examId));
    return async.when(
      loading: () => const SkeletonList(count: 3, lines: 1),
      error: (e, _) => Padding(padding: const EdgeInsets.all(16), child: Text('$e')),
      data: (list) => list.isEmpty
          ? const Padding(padding: EdgeInsets.all(16), child: Text('No mark sheets for your subjects.'))
          : Column(
              children: [
                for (final s in list)
                  ListTile(
                    leading: Icon(
                      (s['entered'] as int) >= (s['students'] as int) ? Icons.check_circle : Icons.edit_note_rounded,
                      color: (s['entered'] as int) >= (s['students'] as int) ? statusColors(context).success : subjectColors[s['subject_color']],
                    ),
                    title: Text('${s['section_label']} · ${s['subject_name']}'),
                    subtitle: Text('${s['entered']}/${s['students']} entered · out of ${marks(_d(s['max_marks']))}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await context.push('/marks/${s['paper_id']}/${s['section_id']}');
                      ref.invalidate(sheetsProvider(examId));
                      ref.invalidate(examsProvider);
                    },
                  ),
              ],
            ),
    );
  }
}

final sheetProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, (String, String)>((ref, a) async {
  final res = await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/exams/papers/${a.$1}/sections/${a.$2}', parse: (d) => (d as Map).cast());
  return res.data;
});

class MarksEntryScreen extends ConsumerStatefulWidget {
  const MarksEntryScreen({super.key, required this.paperId, required this.sectionId});
  final String paperId;
  final String sectionId;
  @override
  ConsumerState<MarksEntryScreen> createState() => _MarksEntryScreenState();
}

class _MarksEntryScreenState extends ConsumerState<MarksEntryScreen> {
  final Map<String, TextEditingController> ctl = {};
  final Map<String, bool> absent = {};
  bool loaded = false;
  bool saving = false;

  @override
  void dispose() {
    for (final c in ctl.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _load(Map<String, dynamic> s) {
    if (loaded) return;
    for (final r in (s['rows'] as List).cast<Map>()) {
      final id = r['student_id'] as String;
      ctl[id] = TextEditingController(text: r['marks'] == null ? '' : marks(_d(r['marks'])));
      absent[id] = r['absent'] as bool;
    }
    loaded = true;
  }

  Future<void> _save(double max) async {
    for (final e in ctl.entries) {
      final v = double.tryParse(e.value.text);
      if (absent[e.key] != true && e.value.text.isNotEmpty && (v == null || v < 0 || v > max)) {
        showSnack(context, 'Marks must be between 0 and ${marks(max)}', error: true);
        return;
      }
    }
    setState(() => saving = true);
    try {
      await ref
          .read(apiClientProvider)
          .put<Object?>(
            '/exams/papers/${widget.paperId}/sections/${widget.sectionId}',
            body: {
              'entries': [
                for (final e in ctl.entries)
                  {
                    'student_id': e.key,
                    'absent': absent[e.key] ?? false,
                    'marks': absent[e.key] == true || e.value.text.isEmpty ? null : double.parse(e.value.text),
                  },
              ],
            },
          );
      if (mounted) {
        showSnack(context, 'Marks saved');
        Navigator.of(context).maybePop();
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.fieldErrors.values.firstOrNull ?? e.message, error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(sheetProvider((widget.paperId, widget.sectionId)));
    return Scaffold(
      appBar: AppBar(title: Text(async.value == null ? 'Marks' : '${async.value!['section_label']} · ${async.value!['subject_name']}')),
      body: AsyncView(
        value: async,
        loading: const SkeletonList(count: 10, lines: 1, gap: 6),
        onRetry: () => ref.invalidate(sheetProvider((widget.paperId, widget.sectionId))),
        builder: (s) {
          _load(s);
          final max = _d(s['max_marks'])!;
          final pass = _d(s['pass_marks'])!;
          final editable = s['editable'] as bool;
          final rows = (s['rows'] as List).cast<Map>();
          return Column(
            children: [
              if (!editable)
                MaterialBanner(
                  leading: const Icon(Icons.lock_outline),
                  content: Text(s['locked_reason'] as String? ?? 'Read only'),
                  actions: const [SizedBox.shrink()],
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Text(
                  '${s['exam_name']} · out of ${marks(max)} · pass ${marks(pass)}',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = rows[i];
                    final id = r['student_id'] as String;
                    final v = double.tryParse(ctl[id]!.text);
                    final isAbsent = absent[id] ?? false;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          SizedBox(width: 28, child: Text('${r['roll_no'] ?? '–'}')),
                          Expanded(
                            child: Text(r['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                          ),
                          SizedBox(
                            width: 76,
                            child: TextField(
                              controller: ctl[id],
                              enabled: editable && !isAbsent,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              textInputAction: i == rows.length - 1 ? TextInputAction.done : TextInputAction.next,
                              textAlign: TextAlign.end,
                              decoration: InputDecoration(isDense: true, hintText: isAbsent ? 'AB' : '—'),
                              style: TextStyle(fontWeight: FontWeight.w700, color: v != null && v < pass ? statusColors(context).danger : null),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 6),
                          SizedBox(
                            width: 46,
                            child: Center(child: isAbsent ? const Text('AB') : GradeChip(v == null || v > max ? null : gradeFor(100 * v / max))),
                          ),
                          Semantics(
                            label: 'Absent',
                            child: Checkbox(value: isAbsent, onChanged: editable ? (c) => setState(() => absent[id] = c ?? false) : null),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              if (editable)
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: FilledButton.icon(
                      onPressed: saving ? null : () => _save(max),
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                      icon: const Icon(Icons.save_rounded),
                      label: Text(saving ? 'Saving…' : 'Save marks'),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
