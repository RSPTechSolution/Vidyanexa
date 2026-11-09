import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../shared/paging.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/motion.dart';
import '../../shared/widgets/open_file.dart';
import '../attendance/my_class_screen.dart' show myClassesProvider;
import '../timetable/timetable_screen.dart' show subjectColors;

final _day = DateFormat('EEE d MMM');

class HomeworkItem {
  HomeworkItem.fromJson(Map<String, dynamic> j)
    : _json = j,
      id = j['id'] as String,
      sectionLabel = j['section_label'] as String,
      subject = j['subject_name'] as String,
      color = j['subject_color'] as String,
      title = j['title'] as String,
      details = j['details'] as String?,
      dueDate = DateTime.parse(j['due_date'] as String),
      teacher = j['teacher'] as String?,
      students = (j['students'] as num?)?.toInt() ?? 0,
      done = (j['done'] as num?)?.toInt() ?? 0,
      checked = (j['checked'] as num?)?.toInt() ?? 0,
      studentId = j['student_id'] as String?,
      studentName = j['student_name'] as String?,
      status = j['status'] as String? ?? 'pending',
      note = j['note'] as String?,
      remark = j['remark'] as String?,
      overdue = j['overdue'] as bool? ?? false,
      roster = [for (final r in (j['roster'] as List? ?? const []).cast<Map>()) RosterRow.fromJson(r.cast())],
      attachments = [for (final f in (j['attachments'] as List? ?? const []).cast<Map>()) AttachedFile.fromJson(f.cast())];
  final List<AttachedFile> attachments;
  final Map<String, dynamic> _json;

  /// The same homework with a new status (shown straight away while the server confirms it).
  HomeworkItem copyWith({String? status}) => HomeworkItem.fromJson({..._json, 'status': ?status, if (status != null && status != 'pending') 'overdue': false});
  final String id;
  final String sectionLabel;
  final String subject;
  final String color;
  final String title;
  final String? details;
  final DateTime dueDate;
  final String? teacher;
  final int students;
  final int done;
  final int checked;
  final String? studentId;
  final String? studentName;
  final String status;
  final String? note;
  final String? remark;
  final bool overdue;
  final List<RosterRow> roster;
}

class RosterRow {
  RosterRow.fromJson(Map<String, dynamic> j)
    : studentId = j['student_id'] as String,
      name = j['name'] as String,
      rollNo = j['roll_no'] as int?,
      status = j['status'] as String,
      note = j['note'] as String?;
  final String studentId;
  final String name;
  final int? rollNo;
  final String status;
  final String? note;
}

final myHomeworkProvider = FutureProvider.autoDispose<List<HomeworkItem>>((ref) async {
  final res = await ref
      .watch(apiClientProvider)
      .get<List<HomeworkItem>>('/homework/my', parse: (d) => [for (final x in (d as List).cast<Map>()) HomeworkItem.fromJson(x.cast())]);
  return res.data;
});

/// Staff homework lists: 'mine' (what I set, and my subjects), 'class' (every subject in the class I am incharge of), or
/// 'all' (everything I may see; admins see the whole school).
final teacherHomeworkProvider = FutureProvider.autoDispose.family<PagedList<HomeworkItem>, String>(
  (ref, view) => fetchPages(ref.watch(apiClientProvider), '/homework', ref.watch(pagesProvider('homework-$view')), HomeworkItem.fromJson,
      query: view == 'all' ? null : {'view': view}),
);

final homeworkDetailProvider = FutureProvider.autoDispose.family<HomeworkItem, String>((ref, id) async {
  final res = await ref.watch(apiClientProvider).get<HomeworkItem>('/homework/$id', parse: (d) => HomeworkItem.fromJson((d as Map).cast()));
  return res.data;
});

final homeworkTargetsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref
      .watch(apiClientProvider)
      .get<List<Map<String, dynamic>>>('/homework/targets', parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()]);
  return res.data;
});

Color _subjectColor(BuildContext context, String c) => subjectColors[c] ?? Theme.of(context).colorScheme.primary;

String dueText(DateTime d) {
  final today = DateUtils.dateOnly(DateTime.now());
  final diff = DateUtils.dateOnly(d).difference(today).inDays;
  return diff == 0
      ? 'Due today'
      : diff == 1
      ? 'Due tomorrow'
      : 'Due ${_day.format(d)}';
}

class HomeworkScreen extends ConsumerWidget {
  const HomeworkScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    if (me == null) return const SizedBox.shrink();
    return me.isFamily ? const FamilyHomeworkView() : const TeacherHomeworkView();
  }
}

// ---- families ------------------------------------------------------------------------------------

class FamilyHomeworkView extends ConsumerStatefulWidget {
  const FamilyHomeworkView({super.key});
  @override
  ConsumerState<FamilyHomeworkView> createState() => _FamilyHomeworkViewState();
}

class _FamilyHomeworkViewState extends ConsumerState<FamilyHomeworkView> {
  int child = 0;

  /// Ticks shown before the server confirms them, by homework and child.
  final _shown = <String, String>{};
  String _key(HomeworkItem h) => '${h.id}:${h.studentId}';

  Future<void> _toggle(HomeworkItem h) async {
    final done = h.status != 'done';
    HapticFeedback.selectionClick();
    setState(() => _shown[_key(h)] = done ? 'done' : 'pending'); // the tick changes at once
    try {
      await ref.read(apiClientProvider).post<Object?>('/homework/${h.id}/done', body: {'student_id': h.studentId, 'done': done});
      if (mounted) showSnack(context, done ? 'Marked as done' : 'Marked as not done');
      ref.invalidate(myHomeworkProvider);
      await ref.read(myHomeworkProvider.future);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _shown.remove(_key(h)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myHomeworkProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Homework')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myHomeworkProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(lines: 3),
          onRetry: () => ref.invalidate(myHomeworkProvider),
          builder: (fetched) {
            final all = [for (final h in fetched) _shown.containsKey(_key(h)) ? h.copyWith(status: _shown[_key(h)]) : h];
            final kids = {for (final h in all) h.studentId!: h.studentName!}.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
            if (kids.isEmpty) {
              return ListView(
                children: const [EmptyPanel(icon: Icons.menu_book_outlined, title: 'No homework', message: 'Nothing set in the last three weeks.')],
              );
            }
            final id = kids[child.clamp(0, kids.length - 1)].key;
            final mine = all.where((h) => h.studentId == id).toList();
            final today = DateUtils.dateOnly(DateTime.now());
            final todo = mine.where((h) => h.status == 'pending' && !h.dueDate.isBefore(today)).toList();
            final overdue = mine.where((h) => h.overdue).toList();
            final done = mine.where((h) => h.status != 'pending').toList()..sort((a, b) => b.dueDate.compareTo(a.dueDate));
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const SizedBox(height: 8),
                ChildSwitcher(
                  names: [for (final k in kids) k.value],
                  subtitles: [for (final k in kids) '${all.where((h) => h.studentId == k.key && h.status == 'pending').length} to do'],
                  index: child,
                  onChanged: (i) => setState(() => child = i),
                ),
                for (final (label, list) in [('To do', todo), ('Overdue', overdue), ('Done', done)])
                  if (list.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
                      child: Text('$label (${list.length})', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    for (final h in list)
                      SwipeAction(
                        id: _key(h),
                        enabled: h.status == 'pending' || h.status == 'done',
                        label: h.status == 'done' ? 'Not done' : 'Mark done',
                        icon: h.status == 'done' ? Icons.undo_rounded : Icons.check_circle_outline,
                        onSwipe: () => _toggle(h),
                        child: _FamilyTile(h: h, onToggle: () => _toggle(h)),
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

class _FamilyTile extends StatelessWidget {
  const _FamilyTile({required this.h, required this.onToggle});
  final HomeworkItem h;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final s = statusColors(context);
    final scheme = Theme.of(context).colorScheme;
    final teacherDone = h.status == 'checked' || h.status == 'incomplete';
    final (icon, color, label) = switch (h.status) {
      'checked' => (Icons.check_circle, s.success, 'Checked by the teacher'),
      'incomplete' => (Icons.cancel, s.danger, 'Teacher marked it incomplete'),
      'done' => (Icons.check_circle, s.info, 'Marked done'),
      _ => (Icons.radio_button_unchecked, scheme.onSurfaceVariant, 'Not done yet'),
    };
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: h.overdue ? s.danger.withValues(alpha: 0.5) : scheme.outline),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 8, 14, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconButton(
              tooltip: teacherDone ? label : (h.status == 'done' ? 'Mark as not done' : 'Mark as done'),
              onPressed: teacherDone ? null : onToggle,
              icon: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Icon(icon, key: ValueKey(h.status), color: color, size: 28),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Pill(h.subject, color: _subjectColor(context, h.color)),
                      Text(
                        h.overdue ? 'Overdue · was due ${_day.format(h.dueDate)}' : dueText(h.dueDate),
                        style: TextStyle(fontSize: 12, color: h.overdue ? s.danger : scheme.onSurfaceVariant, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    h.title,
                    style: TextStyle(fontWeight: FontWeight.w600, color: h.status == 'pending' ? null : scheme.onSurfaceVariant),
                  ),
                  if (h.details != null) Text(h.details!, style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                  if (h.attachments.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: AttachmentChips(files: h.attachments),
                    ),
                  const SizedBox(height: 2),
                  Text('${h.teacher ?? 'Teacher'} · $label', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                  if (h.remark != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('“${h.remark}”', style: const TextStyle(fontStyle: FontStyle.italic)),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---- teachers ------------------------------------------------------------------------------------

class TeacherHomeworkView extends ConsumerWidget {
  const TeacherHomeworkView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    // A class teacher (incharge) gets two tabs, so their class's homework doesn't get mixed in with their own.
    final classes = me?.role == 'teacher' ? (ref.watch(myClassesProvider).value ?? const []) : const [];
    final fab = FloatingActionButton.extended(
      onPressed: () async {
        final ok = await showModalBottomSheet<bool>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => const SetHomeworkSheet(),
        );
        if (ok == true) ref.invalidate(teacherHomeworkProvider);
      },
      icon: const Icon(Icons.add),
      label: const Text('Set homework'),
    );
    if (classes.isEmpty) {
      return Scaffold(appBar: AppBar(title: const Text('Homework')), floatingActionButton: fab, body: const _TeacherHomeworkList(view: 'all'));
    }
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Homework'),
          bottom: TabBar(tabs: [
            const Tab(text: 'My homework'),
            Tab(text: classes.length == 1 ? classes.first.label : 'My classes'),
          ]),
        ),
        floatingActionButton: fab,
        body: const TabBarView(children: [_TeacherHomeworkList(view: 'mine'), _TeacherHomeworkList(view: 'class')]),
      ),
    );
  }
}

class _TeacherHomeworkList extends ConsumerWidget {
  const _TeacherHomeworkList({required this.view});
  final String view;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teacherHomeworkProvider(view));
    final scheme = Theme.of(context).colorScheme;
    return RefreshIndicator(
        onRefresh: () => ref.refresh(teacherHomeworkProvider(view).future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(lines: 3),
          onRetry: () => ref.invalidate(teacherHomeworkProvider(view)),
          builder: (list) => list.isEmpty
              ? ListView(
                  children: const [EmptyPanel(icon: Icons.menu_book_outlined, title: 'No homework yet')],
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
                  itemCount: list.length + 1,
                  itemBuilder: (context, i) {
                    if (i == list.length) return LoadMoreTile(list: 'homework-$view', items: list, noun: 'homework');
                    final h = list[i];
                    return Card(
                      child: ListTile(
                        title: Text(
                          h.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Wrap(
                                spacing: 8,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  Pill(h.subject, color: _subjectColor(context, h.color)),
                                  Text(
                                    [h.sectionLabel, dueText(h.dueDate), if (view == 'class' && h.teacher != null) h.teacher!].join(' · '),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(99),
                                child: LinearProgressIndicator(
                                  value: h.students == 0 ? 0 : h.checked / h.students,
                                  minHeight: 4,
                                  color: statusColors(context).success,
                                  backgroundColor: scheme.outline.withValues(alpha: 0.3),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text('${h.checked} checked · ${h.done} done at home · ${h.students} students', style: const TextStyle(fontSize: 11)),
                            ],
                          ),
                        ),
                        onTap: () async {
                          await context.push('/homework/${h.id}');
                          ref.invalidate(teacherHomeworkProvider);
                        },
                      ),
                    );
                  },
                ),
        ),
      );
  }
}

class SetHomeworkSheet extends ConsumerStatefulWidget {
  const SetHomeworkSheet({super.key});
  @override
  ConsumerState<SetHomeworkSheet> createState() => _SetHomeworkSheetState();
}

class _SetHomeworkSheetState extends ConsumerState<SetHomeworkSheet> {
  String? section;
  String? subject;
  final _title = TextEditingController();
  DateTime due = DateTime.now().add(const Duration(days: 1));
  bool busy = false;
  String? error;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref
          .read(apiClientProvider)
          .post<Object?>(
            '/homework',
            body: {'section_id': section, 'subject_id': subject, 'title': _title.text.trim(), 'due_date': DateFormat('yyyy-MM-dd').format(due)},
          );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      HapticFeedback.heavyImpact();
      setState(() => error = e.fieldErrors.values.firstOrNull ?? e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final targets = ref.watch(homeworkTargetsProvider);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: targets.when(
          loading: () => const SkeletonList(count: 4, lines: 1, padding: EdgeInsets.symmetric(vertical: 12)),
          error: (e, _) => ErrorPanel(message: e.toString()),
          data: (list) {
            if (list.isEmpty) return const EmptyPanel(icon: Icons.class_outlined, title: "You don't teach any classes yet");
            section ??= list.first['section_id'] as String;
            final t = list.firstWhere((x) => x['section_id'] == section);
            final subjects = (t['subjects'] as List).cast<Map>();
            if (subject == null || !subjects.any((s) => s['id'] == subject)) subject = subjects.isEmpty ? null : subjects.first['id'] as String;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Set homework', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: section,
                  decoration: const InputDecoration(labelText: 'Class'),
                  items: [for (final x in list) DropdownMenuItem(value: x['section_id'] as String, child: Text(x['section_label'] as String))],
                  onChanged: (v) => setState(() {
                    section = v;
                    subject = null;
                  }),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in subjects)
                      ChoiceChip(
                        label: Text(s['name'] as String),
                        selected: subject == s['id'],
                        onSelected: (_) => setState(() => subject = s['id'] as String),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _title,
                  decoration: InputDecoration(labelText: 'Task', hintText: 'e.g. Exercise 4.2, Q1–10', errorText: error),
                  maxLength: 200,
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event_outlined),
                  title: Text('Due ${_day.format(due)}'),
                  trailing: const Icon(Icons.edit_calendar_outlined),
                  onTap: () async {
                    final d = await showDatePicker(
                      context: context,
                      initialDate: due,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 60)),
                    );
                    if (d != null) setState(() => due = d);
                  },
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: busy || subject == null || _title.text.trim().length < 3 ? null : _save,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: Text(busy ? 'Saving…' : 'Set homework'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class HomeworkCheckScreen extends ConsumerStatefulWidget {
  const HomeworkCheckScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<HomeworkCheckScreen> createState() => _HomeworkCheckScreenState();
}

class _HomeworkCheckScreenState extends ConsumerState<HomeworkCheckScreen> {
  final Map<String, String> changes = {};
  bool saving = false;

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      await ref
          .read(apiClientProvider)
          .put<Object?>(
            '/homework/${widget.id}/check',
            body: {
              'entries': [
                for (final e in changes.entries) {'student_id': e.key, 'status': e.value},
              ],
            },
          );
      changes.clear();
      ref.invalidate(homeworkDetailProvider(widget.id));
      if (mounted) showSnack(context, 'Saved');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(homeworkDetailProvider(widget.id));
    final s = statusColors(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Check homework'),
        actions: [
          TextButton(
            onPressed: async.value == null
                ? null
                : () => setState(() {
                    for (final r in async.value!.roster) {
                      changes[r.studentId] = 'checked';
                    }
                  }),
            child: const Text('All checked'),
          ),
        ],
      ),
      bottomNavigationBar: changes.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  onPressed: saving ? null : _save,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: Text(saving ? 'Saving…' : 'Save (${changes.length})'),
                ),
              ),
            ),
      body: AsyncView(
        value: async,
        loading: const SkeletonDetail(rows: 5),
        onRetry: () => ref.invalidate(homeworkDetailProvider(widget.id)),
        builder: (h) => ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      children: [
                        Pill(h.subject, color: _subjectColor(context, h.color)),
                        Text(h.sectionLabel),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(h.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    Text(dueText(h.dueDate), style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
            ),
            for (final r in h.roster)
              Builder(
                builder: (context) {
                  final st = changes[r.studentId] ?? r.status;
                  return ListTile(
                    leading: CircleAvatar(child: Text('${r.rollNo ?? '–'}')),
                    title: Text(r.name),
                    subtitle: Text(
                      [
                        switch (st) {
                          'checked' => 'Checked',
                          'incomplete' => 'Incomplete',
                          'done' => 'Done at home',
                          _ => 'Not done',
                        },
                        if (r.note != null) '“${r.note}”',
                      ].join(' · '),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Checked',
                          isSelected: st == 'checked',
                          onPressed: () => setState(() => changes[r.studentId] = 'checked'),
                          icon: Icon(st == 'checked' ? Icons.check_circle : Icons.check_circle_outline, color: st == 'checked' ? s.success : null),
                        ),
                        IconButton(
                          tooltip: 'Incomplete',
                          isSelected: st == 'incomplete',
                          onPressed: () => setState(() => changes[r.studentId] = 'incomplete'),
                          icon: Icon(st == 'incomplete' ? Icons.cancel : Icons.cancel_outlined, color: st == 'incomplete' ? s.danger : null),
                        ),
                      ],
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}
