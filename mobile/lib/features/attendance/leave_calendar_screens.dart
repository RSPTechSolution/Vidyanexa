import '../notices/create_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/form_widgets.dart';
import 'attendance_data.dart';

final _day = DateFormat('EEE d MMM');
String _iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

// ---- leave ------------------------------------------------------------------------------------

class LeaveItem {
  LeaveItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        studentName = j['student_name'] as String,
        classSection = j['class_section'] as String,
        from = DateTime.parse(j['from_date'] as String),
        to = DateTime.parse(j['to_date'] as String),
        days = (j['days'] as num).toInt(),
        kind = j['kind'] as String,
        reason = j['reason'] as String,
        status = j['status'] as String,
        decidedBy = j['decided_by'] as String?,
        note = j['decision_note'] as String?,
        canDecide = j['can_decide'] as bool? ?? false,
        canCancel = j['can_cancel'] as bool? ?? false;
  final String id;
  final String studentName;
  final String classSection;
  final DateTime from;
  final DateTime to;
  final int days;
  final String kind;
  final String reason;
  final String status;
  final String? decidedBy;
  final String? note;
  final bool canDecide;
  final bool canCancel;

  String get range => from == to ? _day.format(from) : '${DateFormat('d MMM').format(from)} – ${DateFormat('d MMM').format(to)}';
}

const _kinds = {'sick': 'Unwell', 'family': 'Family function', 'travel': 'Travel', 'other': 'Other'};

final leaveProvider = FutureProvider.autoDispose<List<LeaveItem>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<LeaveItem>>('/leave',
      parse: (d) => [for (final x in (d as List).cast<Map>()) LeaveItem.fromJson(x.cast())]);
  return res.data;
});

class LeaveScreen extends ConsumerWidget {
  const LeaveScreen({super.key});

  Future<void> _decide(BuildContext context, WidgetRef ref, LeaveItem l, bool approve) async {
    try {
      await ref.read(apiClientProvider).post<Object?>('/leave/${l.id}/decide', body: {'approve': approve});
      ref.invalidate(leaveProvider);
      if (context.mounted) showSnack(context, approve ? 'Approved: ${l.days} day(s) marked as leave' : 'Declined');
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, e.message, error: true);
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref, LeaveItem l) async {
    try {
      await ref.read(apiClientProvider).post<Object?>('/leave/${l.id}/cancel');
      ref.invalidate(leaveProvider);
      if (context.mounted) showSnack(context, 'Request withdrawn');
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final family = me?.isFamily ?? false;
    final async = ref.watch(leaveProvider);
    final s = statusColors(context);
    final scheme = Theme.of(context).colorScheme;
    Color tone(String st) => switch (st) { 'approved' => s.success, 'rejected' => s.danger, 'pending' => s.warning, _ => scheme.onSurfaceVariant };
    return Scaffold(
      appBar: AppBar(title: Text(family ? 'Leave' : 'Leave requests')),
      floatingActionButton: family
          ? FloatingActionButton.extended(
              onPressed: () async {
                final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const LeaveRequestScreen()));
                if (sent == true) ref.invalidate(leaveProvider);
              },
              icon: const Icon(Icons.add),
              label: const Text('Ask for leave'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(leaveProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(),
          onRetry: () => ref.invalidate(leaveProvider),
          builder: (list) => list.isEmpty
              ? ListView(children: [
                  EmptyPanel(icon: Icons.event_busy_outlined, title: family ? 'No leave requests' : 'Nothing waiting',
                      message: family ? 'Ask ahead and the day counts as leave, not absent.' : null),
                ])
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final l = list[i];
                    return Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(family ? l.range : l.studentName, style: const TextStyle(fontWeight: FontWeight.w800))),
                            Pill(l.status[0].toUpperCase() + l.status.substring(1), color: tone(l.status)),
                          ]),
                          const SizedBox(height: 2),
                          Text('${family ? l.studentName : '${l.classSection} · ${l.range}'} · ${l.days} day${l.days == 1 ? '' : 's'} · ${_kinds[l.kind] ?? l.kind}',
                              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                          const SizedBox(height: 6),
                          Text(l.reason),
                          if (l.decidedBy != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text('By ${l.decidedBy}${l.note != null ? ': “${l.note}”' : ''}',
                                  style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                            ),
                          if (l.canDecide)
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: Row(children: [
                                Expanded(child: FilledButton.icon(onPressed: () => _decide(context, ref, l, true), icon: const Icon(Icons.check), label: const Text('Approve'))),
                                const SizedBox(width: 8),
                                Expanded(child: OutlinedButton.icon(onPressed: () => _decide(context, ref, l, false), icon: const Icon(Icons.close), label: const Text('Decline'))),
                              ]),
                            ),
                          if (l.canCancel)
                            Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: () => _cancel(context, ref, l), child: const Text('Withdraw request'))),
                        ]),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class LeaveRequestScreen extends ConsumerStatefulWidget {
  const LeaveRequestScreen({super.key});

  @override
  ConsumerState<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends ConsumerState<LeaveRequestScreen> {
  String? _student;
  late DateTime _from = DateTime.now().add(const Duration(days: 1));
  late DateTime _to = _from;
  String _kind = 'sick';
  final _reason = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick(bool start) async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: start ? _from : _to, firstDate: now.subtract(const Duration(days: 7)),
        lastDate: now.add(const Duration(days: 120)));
    if (d == null) return;
    setState(() {
      if (start) {
        _from = d;
        if (_to.isBefore(d)) _to = d;
      } else {
        _to = d.isBefore(_from) ? _from : d;
      }
    });
  }

  Future<void> _send() async {
    setState(() { _saving = true; _error = null; });
    try {
      await ref.read(apiClientProvider).post<Object?>('/leave', body: {
        'student_id': _student, 'from_date': _iso(_from), 'to_date': _iso(_to), 'kind': _kind, 'reason': _reason.text.trim(),
      });
      if (mounted) {
        showSnack(context, 'Leave requested. The class teacher has been told.');
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.fieldErrors.values.firstOrNull ?? e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kids = ref.watch(myAttendanceProvider(DateFormat('yyyy-MM').format(DateTime.now()))).value ?? const [];
    _student ??= kids.isNotEmpty ? kids.first.studentId : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Ask for leave')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (_error != null) ...[FormBanner(message: _error!), const SizedBox(height: 12)],
        if (kids.length > 1) ...[
          const FieldLabel('Child'),
          DropdownButtonFormField<String>(
            initialValue: _student,
            items: [for (final k in kids) DropdownMenuItem(value: k.studentId, child: Text('${k.name} · ${k.classSection}'))],
            onChanged: (v) => setState(() => _student = v),
          ),
          const SizedBox(height: 16),
        ],
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _pick(true), icon: const Icon(Icons.event), label: Text('From ${_day.format(_from)}'))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: () => _pick(false), icon: const Icon(Icons.event), label: Text('To ${_day.format(_to)}'))),
        ]),
        const SizedBox(height: 16),
        const FieldLabel('Why'),
        Wrap(spacing: 8, children: [
          for (final e in _kinds.entries) ChoiceChip(label: Text(e.value), selected: _kind == e.key, onSelected: (_) => setState(() => _kind = e.key)),
        ]),
        const SizedBox(height: 16),
        const FieldLabel('Message to the teacher'),
        TextField(controller: _reason, maxLines: 4, maxLength: 1000, onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'e.g. Fever since last night; doctor advised rest')),
        const SizedBox(height: 8),
        LoadingButton(label: 'Send request', loading: _saving, onPressed: _student == null || _reason.text.trim().length < 3 ? null : _send),
      ]),
    );
  }
}

// ---- calendar ---------------------------------------------------------------------------------

class SchoolEvent {
  SchoolEvent.fromJson(Map<String, dynamic> j)
      : title = j['title'] as String,
        kind = j['kind'] as String,
        start = DateTime.parse(j['start_date'] as String),
        end = DateTime.parse(j['end_date'] as String),
        description = j['description'] as String?;
  final String title;
  final String kind;
  final DateTime start;
  final DateTime end;
  final String? description;
}

final calendarProvider = FutureProvider.autoDispose<List<SchoolEvent>>((ref) async {
  final now = DateTime.now();
  final res = await ref.watch(apiClientProvider).get<List<SchoolEvent>>('/calendar',
      query: {'from': _iso(DateTime(now.year, now.month, 1)), 'to': _iso(DateTime(now.year, now.month + 6, 0))},
      parse: (d) => [for (final x in (d as List).cast<Map>()) SchoolEvent.fromJson(x.cast())]);
  return res.data;
});

class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(calendarProvider);
    final s = statusColors(context);
    final scheme = Theme.of(context).colorScheme;
    (String, Color) meta(String k) => switch (k) {
          'holiday' => ('Holiday', s.danger),
          'vacation' => ('Vacation', s.warning),
          'exam' => ('Exam', scheme.tertiary),
          'ptm' => ('Parent-teacher meeting', s.success),
          _ => ('Event', scheme.primary),
        };
    return Scaffold(
      appBar: AppBar(title: const Text('School calendar')),
      floatingActionButton: ref.watch(meProvider)?.can('calendar.manage') == true
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.add),
              label: const Text('Add'),
              onPressed: () async {
                final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const NewEventScreen()));
                if (done == true) ref.invalidate(calendarProvider);
              },
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(calendarProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(count: 7),
          onRetry: () => ref.invalidate(calendarProvider),
          builder: (list) {
            if (list.isEmpty) return ListView(children: const [EmptyPanel(icon: Icons.event_note_outlined, title: 'Nothing on the calendar')]);
            String? lastMonth;
            final children = <Widget>[];
            for (final e in list) {
              final m = DateFormat('MMMM yyyy').format(e.start);
              if (m != lastMonth) {
                children.add(Padding(padding: const EdgeInsets.fromLTRB(4, 16, 4, 8), child: Text(m, style: const TextStyle(fontWeight: FontWeight.w800))));
                lastMonth = m;
              }
              final (label, color) = meta(e.kind);
              children.add(Card(
                child: ListTile(
                  leading: Container(width: 6, height: 40, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
                  title: Text(e.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${e.start == e.end ? _day.format(e.start) : '${_day.format(e.start)} – ${_day.format(e.end)}'} · $label'
                      '${e.description != null ? '\n${e.description}' : ''}'),
                  isThreeLine: e.description != null,
                ),
              ));
            }
            return ListView(padding: const EdgeInsets.fromLTRB(12, 0, 12, 24), children: children);
          },
        ),
      ),
    );
  }
}
