import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/form_widgets.dart';
import '../attendance/attendance_data.dart';

List<Map<String, dynamic>> _list(Object? d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()];
Map<String, dynamic> _map(Object? d) => (d as Map).cast<String, dynamic>();
final _when = DateFormat('EEE d MMM, h:mm a');
final _time = DateFormat('h:mm a');

const _passLabel = {'pending': 'Waiting', 'approved': 'Approved', 'used': 'Left school', 'rejected': 'Declined', 'cancelled': 'Cancelled'};

final gatePassesProvider = FutureProvider.autoDispose((ref) async =>
    (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/gate/passes', parse: _list)).data);

Color _passColor(BuildContext context, String status) {
  final c = statusColors(context);
  return switch (status) { 'pending' => c.warning, 'approved' => Theme.of(context).colorScheme.primary, 'used' => c.success, 'rejected' => c.danger, _ => Colors.grey };
}

/// Families ask for an early pickup and see the code; class teachers approve.
class GatePassesScreen extends ConsumerWidget {
  const GatePassesScreen({super.key});

  Future<void> _act(BuildContext context, WidgetRef ref, String path, Object? body, String done) async {
    try {
      await ref.read(apiClientProvider).post<Object?>(path, body: body);
      ref.invalidate(gatePassesProvider);
      if (context.mounted) showSnack(context, done);
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final passes = ref.watch(gatePassesProvider);
    final family = me?.isFamily ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Gate passes')),
      floatingActionButton: family
          ? FloatingActionButton.extended(
              onPressed: () async {
                final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const GatePassRequestScreen()));
                if (sent == true) ref.invalidate(gatePassesProvider);
              },
              icon: const Icon(Icons.add),
              label: const Text('Early pickup'))
          : null,
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(gatePassesProvider),
        child: AsyncView(
          value: passes,
          loading: const SkeletonList(),
          onRetry: () => ref.invalidate(gatePassesProvider),
          builder: (rows) => rows.isEmpty
              ? ListView(children: const [EmptyPanel(icon: Icons.confirmation_number_outlined, title: 'No gate passes',
                  message: 'Need to collect your child early? Ask here and show the code at the gate.')])
              : ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 96), children: [
                  for (final p in rows)
                    Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(p['student_name'] as String, style: const TextStyle(fontWeight: FontWeight.w700))),
                            Pill(_passLabel[p['status']] ?? p['status'] as String, color: _passColor(context, p['status'] as String)),
                          ]),
                          const SizedBox(height: 4),
                          Text('${_when.format(DateTime.parse(p['leave_at'] as String).toLocal())} · ${p['pickup_name']} (${p['pickup_relation']})'),
                          Text(p['reason'] as String, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                          if (p['code'] != null) ...[
                            const SizedBox(height: 10),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
                              child: Column(children: [
                                const Text('Show this code at the gate'),
                                Text(p['code'] as String, style: TextStyle(fontSize: 32, letterSpacing: 8, fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.primary)),
                              ]),
                            ),
                          ],
                          if (p['used_at'] != null) Text('Left at ${_time.format(DateTime.parse(p['used_at'] as String).toLocal())}', style: TextStyle(color: statusColors(context).success)),
                          if (p['can_decide'] == true || p['can_cancel'] == true)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Wrap(spacing: 8, children: [
                                if (p['can_decide'] == true)
                                  FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                                      onPressed: () => _act(context, ref, '/gate/passes/${p['id']}/decide', {'approve': true}, 'Approved. The family has the code.'), child: const Text('Approve')),
                                if (p['can_decide'] == true)
                                  OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                                      onPressed: () => _act(context, ref, '/gate/passes/${p['id']}/decide', {'approve': false}, 'Declined'), child: const Text('Decline')),
                                if (p['can_cancel'] == true)
                                  TextButton(onPressed: () => _act(context, ref, '/gate/passes/${p['id']}/cancel', null, 'Cancelled'), child: const Text('Cancel pass')),
                              ]),
                            ),
                        ]),
                      ),
                    ),
                ]),
        ),
      ),
    );
  }
}

class GatePassRequestScreen extends ConsumerStatefulWidget {
  const GatePassRequestScreen({super.key});

  @override
  ConsumerState<GatePassRequestScreen> createState() => _GatePassRequestState();
}

class _GatePassRequestState extends ConsumerState<GatePassRequestScreen> {
  String? _student;
  DateTime _at = DateTime.now().add(const Duration(hours: 2));
  final _reason = TextEditingController();
  final _name = TextEditingController();
  final _relation = TextEditingController();
  final _phone = TextEditingController();
  bool _saving = false;
  String? _error;

  Future<void> _pick() async {
    final d = await showDatePicker(context: context, initialDate: _at, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 14)));
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_at));
    if (t == null) return;
    setState(() => _at = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  Future<void> _send() async {
    setState(() { _saving = true; _error = null; });
    try {
      await ref.read(apiClientProvider).post<Object?>('/gate/passes', body: {
        'student_id': _student, 'reason': _reason.text.trim(), 'pickup_name': _name.text.trim(), 'pickup_relation': _relation.text.trim(),
        'pickup_phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(), 'leave_at': _at.toUtc().toIso8601String(),
      });
      if (mounted) {
        showSnack(context, "Sent. You'll get the code once the class teacher approves.");
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
    final ready = _student != null && _reason.text.trim().length >= 2 && _name.text.trim().length >= 2 && _relation.text.trim().length >= 2;
    return Scaffold(
      appBar: AppBar(title: const Text('Early pickup')),
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
        const FieldLabel('Leaving at'),
        OutlinedButton.icon(onPressed: _pick, icon: const Icon(Icons.schedule), label: Text(_when.format(_at))),
        const SizedBox(height: 16),
        const FieldLabel('Reason'),
        TextField(controller: _reason, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "e.g. Doctor's appointment")),
        const SizedBox(height: 16),
        const FieldLabel('Collected by'),
        TextField(controller: _name, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Full name')),
        const SizedBox(height: 16),
        const FieldLabel('Relation'),
        TextField(controller: _relation, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Mother, uncle, driver…')),
        const SizedBox(height: 16),
        const FieldLabel('Their phone'),
        TextField(controller: _phone, keyboardType: TextInputType.phone),
        const SizedBox(height: 20),
        LoadingButton(label: 'Send request', loading: _saving, onPressed: ready ? _send : null),
      ]),
    );
  }
}

// ---- CCTV -------------------------------------------------------------------------------------

final _cctvProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final settings = (await api.get<Map<String, dynamic>>('/cctv/settings', parse: _map)).data;
  final consent = (await api.get<List<Map<String, dynamic>>>('/cctv/consent', parse: _list)).data;
  final cameras = (await api.get<List<Map<String, dynamic>>>('/cctv/cameras', parse: _list)).data;
  return (settings: settings, consent: consent, cameras: cameras);
});

/// Families: the school's CCTV policy, their consent, and classroom viewing when the whole class agrees.
class CctvScreen extends ConsumerWidget {
  const CctvScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_cctvProvider);
    final me = ref.watch(meProvider);
    Future<void> answer(String studentId, bool yes) async {
      try {
        await ref.read(apiClientProvider).put<Object?>('/cctv/consent', body: {'student_id': studentId, 'consent': yes});
        ref.invalidate(_cctvProvider);
        if (context.mounted) showSnack(context, yes ? 'Thank you. Your consent is recorded.' : 'Recorded.');
      } on ApiException catch (e) {
        if (context.mounted) showSnack(context, e.message, error: true);
      }
    }

    Future<void> watch(String id) async {
      try {
        final r = await ref.read(apiClientProvider).post<Map<String, dynamic>>('/cctv/cameras/$id/watch', parse: _map);
        await launchUrl(Uri.parse(r.data['stream_url'] as String), mode: LaunchMode.externalApplication);
      } on ApiException catch (e) {
        if (context.mounted) showSnack(context, e.message, error: true);
      }
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Classroom CCTV')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_cctvProvider),
        child: AsyncView(
          value: data,
          loading: const SkeletonGrid(count: 4, height: 150),
          onRetry: () => ref.invalidate(_cctvProvider),
          builder: (d) => ListView(padding: const EdgeInsets.all(12), children: [
            Card(child: Padding(padding: const EdgeInsets.all(14), child: Text(d.settings['policy'] as String? ?? ''))),
            const SizedBox(height: 8),
            Text('Your consent', style: Theme.of(context).textTheme.titleMedium),
            for (final c in d.consent)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${c['name']} · ${c['class_section']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(c['consent'] == null ? "You haven't answered yet." : c['consent'] == true ? 'You agreed.' : "You didn't agree."),
                    if (me?.role == 'parent')
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Wrap(spacing: 8, children: [
                          ChoiceChip(label: const Text('I agree'), selected: c['consent'] == true, onSelected: (_) => answer(c['student_id'] as String, true)),
                          ChoiceChip(label: const Text("I don't agree"), selected: c['consent'] == false, onSelected: (_) => answer(c['student_id'] as String, false)),
                        ]),
                      ),
                  ]),
                ),
              ),
            const SizedBox(height: 8),
            Text('Classroom cameras', style: Theme.of(context).textTheme.titleMedium),
            if (d.cameras.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('No classroom cameras are open to families.')),
            for (final cam in d.cameras)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: const Icon(Icons.videocam_outlined),
                  title: Text(cam['name'] as String),
                  subtitle: Text(cam['watchable'] == true ? 'Live now' : (cam['blocked_reason'] as String? ?? '')),
                  trailing: FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                    onPressed: cam['watchable'] == true ? () => watch(cam['id'] as String) : null,
                    child: const Text('Watch'),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

// ---- gate desk (guards and the front office) --------------------------------------------------

final _insideProvider = FutureProvider.autoDispose((ref) async =>
    (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/gate/visitors',
        query: {'date': DateFormat('yyyy-MM-dd').format(DateTime.now())}, parse: _list)).data);

class GateDeskScreen extends ConsumerStatefulWidget {
  const GateDeskScreen({super.key});

  @override
  ConsumerState<GateDeskScreen> createState() => _GateDeskState();
}

class _GateDeskState extends ConsumerState<GateDeskScreen> {
  final _code = TextEditingController();
  Map<String, dynamic>? _pass;
  bool _busy = false;

  Future<void> _verify() async {
    setState(() => _busy = true);
    try {
      final r = await ref.read(apiClientProvider).get<Map<String, dynamic>>('/gate/passes/verify', query: {'code': _code.text.trim()}, parse: _map);
      setState(() => _pass = r.data);
    } on ApiException catch (e) {
      setState(() => _pass = null);
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _left() async {
    try {
      final r = await ref.read(apiClientProvider).post<Map<String, dynamic>>('/gate/passes/${_pass!['id']}/left', parse: _map);
      setState(() { _pass = r.data; _code.clear(); });
      if (mounted) showSnack(context, '${r.data['student_name']} has left. The family has been told.');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  Future<void> _visitor(String id, String action) async {
    try {
      await ref.read(apiClientProvider).post<Object?>('/gate/visitors/$id/$action', body: action == 'arrive' ? <String, dynamic>{} : null);
      ref.invalidate(_insideProvider);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final visitors = ref.watch(_insideProvider);
    final p = _pass;
    return Scaffold(
      appBar: AppBar(title: const Text('Gate desk')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_insideProvider),
        child: ListView(padding: const EdgeInsets.all(12), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Gate pass code', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: TextField(controller: _code, keyboardType: TextInputType.number, maxLength: 6, onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(hintText: '6-digit code', counterText: ''))),
                  const SizedBox(width: 8),
                  FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                      onPressed: _code.text.trim().length == 6 && !_busy ? _verify : null, child: const Text('Check')),
                ]),
                if (p != null) ...[
                  const SizedBox(height: 12),
                  Text('${p['student_name']} · ${p['class_section']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  Text('Going with ${p['pickup_name']} (${p['pickup_relation']})'),
                  Text(p['reason'] as String),
                  const SizedBox(height: 8),
                  if (p['status'] == 'approved')
                    FilledButton.icon(onPressed: _left, icon: const Icon(Icons.logout), label: const Text('Checked ID: let them leave'))
                  else
                    Pill(_passLabel[p['status']] ?? p['status'] as String, color: _passColor(context, p['status'] as String)),
                ],
              ]),
            ),
          ),
          const SizedBox(height: 8),
          Text('Visitors today', style: Theme.of(context).textTheme.titleMedium),
          AsyncView(
            value: visitors,
            loading: const SkeletonList(count: 4, padding: EdgeInsets.zero),
            onRetry: () => ref.invalidate(_insideProvider),
            builder: (rows) {
              final open = rows.where((v) => v['status'] == 'in' || v['status'] == 'expected').toList();
              if (open.isEmpty) return const Padding(padding: EdgeInsets.all(8), child: Text('No visitors inside or expected.'));
              return Column(children: [
                for (final v in open)
                  Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      title: Text(v['name'] as String),
                      subtitle: Text('${v['purpose']}${v['meeting'] != null ? ' · to see ${v['meeting']}' : ''}'),
                      trailing: v['status'] == 'expected'
                          ? FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 40)), onPressed: () => _visitor(v['id'] as String, 'arrive'), child: const Text('Arrived'))
                          : OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)), onPressed: () => _visitor(v['id'] as String, 'out'), child: const Text('Out')),
                    ),
                  ),
              ]);
            },
          ),
        ]),
      ),
    );
  }
}

