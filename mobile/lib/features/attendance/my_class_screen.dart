import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';

/// The class teacher's (incharge's) view of their class: today's attendance, leave, gate passes and fee dues, and the
/// roster with each student's attendance, fees and parents.
class MyClassCard {
  MyClassCard.fromJson(Map<String, dynamic> j)
      : sectionId = j['section_id'] as String,
        label = j['label'] as String,
        students = j['students'] as int,
        marked = j['attendance_marked'] as bool,
        present = j['present'] as int,
        absent = j['absent'] as int,
        onLeave = j['on_leave'] as int,
        pendingLeave = j['pending_leave'] as int,
        pendingGatePasses = j['pending_gate_passes'] as int,
        feesEnabled = j['fees_enabled'] as bool,
        studentsOverdue = j['students_overdue'] as int,
        overdueAmount = (j['overdue_amount'] as num).toDouble();

  final String sectionId, label;
  final int students, present, absent, onLeave, pendingLeave, pendingGatePasses, studentsOverdue;
  final bool marked, feesEnabled;
  final double overdueAmount;
}

class ClassStudentRow {
  ClassStudentRow.fromJson(Map<String, dynamic> j)
      : name = j['name'] as String,
        rollNo = j['roll_no'] as int?,
        admissionNo = j['admission_no'] as String,
        today = j['today'] as String?,
        percent = (j['attendance_percent'] as num?)?.toDouble(),
        feeDue = (j['fee_due'] as num).toDouble(),
        feeOverdue = j['fee_overdue'] as bool,
        guardians = (j['guardians'] as List).cast<String>();

  final String name, admissionNo;
  final int? rollNo;
  final String? today;
  final double? percent;
  final double feeDue;
  final bool feeOverdue;
  final List<String> guardians;
}

final myClassesProvider = FutureProvider.autoDispose<List<MyClassCard>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<MyClassCard>>('/classes/my',
      parse: (d) => [for (final x in (d as List).cast<Map>()) MyClassCard.fromJson(x.cast())]);
  return res.data;
});

final myClassRosterProvider = FutureProvider.autoDispose.family<List<ClassStudentRow>, String>((ref, id) async {
  final res = await ref.watch(apiClientProvider).get<List<ClassStudentRow>>('/classes/my/$id',
      parse: (d) => [for (final x in ((d as Map)['students'] as List).cast<Map>()) ClassStudentRow.fromJson(x.cast())]);
  return res.data;
});

class MyClassScreen extends ConsumerStatefulWidget {
  const MyClassScreen({super.key});

  @override
  ConsumerState<MyClassScreen> createState() => _MyClassScreenState();
}

class _MyClassScreenState extends ConsumerState<MyClassScreen> {
  int index = 0;
  bool reminding = false;

  Future<void> _remind(MyClassCard c) async {
    setState(() => reminding = true);
    try {
      final res = await ref.read(apiClientProvider).post<Map<String, dynamic>>('/classes/my/${c.sectionId}/fee-reminders',
          body: {'overdue_only': true}, parse: (d) => (d as Map).cast<String, dynamic>());
      final n = res.data['families'] as int? ?? 0;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(n > 0 ? 'Reminded $n ${n == 1 ? 'family' : 'families'} about overdue fees' : 'No one to remind right now')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => reminding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myClassesProvider);
    final scheme = Theme.of(context).colorScheme;
    final s = statusColors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('My class')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myClassesProvider),
        child: AsyncView(
          value: async,
          loading: const SkeletonSummary(rows: 6),
          onRetry: () => ref.invalidate(myClassesProvider),
          builder: (list) {
            if (list.isEmpty) {
              return ListView(children: const [
                EmptyPanel(
                  icon: Icons.class_outlined,
                  title: "You aren't a class teacher yet",
                  message: 'The class teacher (incharge) of a section takes its attendance, decides leave and reminds parents about fees.',
                ),
              ]);
            }
            final c = list[index.clamp(0, list.length - 1)];
            final roster = ref.watch(myClassRosterProvider(c.sectionId));
            return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
              if (list.length > 1)
                Wrap(spacing: 8, children: [
                  for (final (i, x) in list.indexed)
                    ChoiceChip(label: Text(x.label), selected: i == index, onSelected: (_) => setState(() => index = i)),
                ]),
              Text(c.label, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              // Equal heights, whatever the phone's font size.
              IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _Stat(label: 'Attendance', value: c.marked ? '${c.present}/${c.students}' : 'Not taken', color: c.marked ? s.success : s.warning),
                const SizedBox(width: 8),
                _Stat(label: 'Leave', value: '${c.pendingLeave}', color: c.pendingLeave > 0 ? s.warning : scheme.onSurfaceVariant),
                const SizedBox(width: 8),
                _Stat(label: 'Gate passes', value: '${c.pendingGatePasses}', color: c.pendingGatePasses > 0 ? s.warning : scheme.onSurfaceVariant),
              ])),
              if (c.feesEnabled) ...[
                const SizedBox(height: 8),
                // The amount gets the whole width (a button beside it squeezed "₹45,050" onto two lines with a big font).
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Icon(Icons.currency_rupee_rounded, color: c.studentsOverdue > 0 ? s.danger : s.success),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(c.studentsOverdue > 0 ? '${inr(c.overdueAmount)} overdue' : 'No overdue fees',
                                style: Theme.of(context).textTheme.titleMedium),
                            Text('${c.studentsOverdue} ${c.studentsOverdue == 1 ? 'student' : 'students'}',
                                style: TextStyle(color: scheme.onSurfaceVariant)),
                          ]),
                        ),
                      ]),
                      if (c.studentsOverdue > 0)
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            onPressed: reminding ? null : () => _remind(c),
                            icon: const Icon(Icons.notifications_active_outlined),
                            label: Text(reminding ? 'Sending…' : 'Remind parents'),
                          ),
                        ),
                    ]),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              // One under the other, full width: side by side they broke words ("Leav / e") with a big font.
              FilledButton.icon(
                onPressed: () => context.push(Uri(path: '/attendance/mark/${c.sectionId}', queryParameters: {'label': c.label}).toString()),
                icon: const Icon(Icons.fact_check_outlined),
                label: Text(c.marked ? 'Update attendance' : 'Take attendance'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(onPressed: () => context.push('/leave'), icon: const Icon(Icons.event_busy_outlined), label: const Text('Leave requests')),
              const SizedBox(height: 20),
              Text('Students', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              roster.when(
                skipLoadingOnRefresh: true,
                loading: () => const SkeletonList(count: 6, padding: EdgeInsets.zero),
                error: (e, _) => ErrorPanel(message: e is ApiException ? e.message : 'Could not load the class', onRetry: () => ref.invalidate(myClassRosterProvider(c.sectionId))),
                data: (rows) => Column(children: [
                  for (final r in rows)
                    Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text('${r.rollNo != null ? '${r.rollNo}. ' : ''}${r.name}', style: const TextStyle(fontWeight: FontWeight.w600))),
                            if (r.percent != null) Pill('${r.percent!.toStringAsFixed(r.percent! % 1 == 0 ? 0 : 1)}%', color: r.percent! < 75 ? s.danger : s.success),
                          ]),
                          const SizedBox(height: 4),
                          Text([r.admissionNo, if (r.today != null) 'today: ${r.today!.replaceAll('_', ' ')}', if (r.feeDue > 0) '${inr(r.feeDue)} ${r.feeOverdue ? 'overdue' : 'due'}'].join(' · '),
                              style: TextStyle(fontSize: 12.5, color: r.feeOverdue ? s.danger : scheme.onSurfaceVariant)),
                          for (final g in r.guardians) Text(g, style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant)),
                        ]),
                      ),
                    ),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Shrunk to fit on one line rather than broken mid-word ("Attendan / ce").
              FittedBox(fit: BoxFit.scaleDown, child: Text(value, maxLines: 1, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color))),
              const SizedBox(height: 2),
              FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant))),
            ]),
          ),
        ),
      );
}
