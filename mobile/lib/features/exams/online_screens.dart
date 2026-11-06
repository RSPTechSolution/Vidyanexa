import '../notices/create_screens.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';

final _when = DateFormat('d MMM, h:mm a');

// ---- online tests -------------------------------------------------------------------------------

class MyTestItem {
  MyTestItem.fromJson(Map<String, dynamic> j)
      : testId = j['test_id'] as String,
        title = j['title'] as String,
        subject = j['subject_name'] as String,
        studentName = j['student_name'] as String,
        opensAt = DateTime.parse(j['opens_at'] as String).toLocal(),
        closesAt = DateTime.parse(j['closes_at'] as String).toLocal(),
        minutes = (j['duration_minutes'] as num).toInt(),
        questions = (j['questions'] as num).toInt(),
        maxMarks = (j['max_marks'] as num).toDouble(),
        state = j['state'] as String,
        score = (j['score'] as num?)?.toDouble(),
        percent = (j['percent'] as num?)?.toDouble();
  final String testId;
  final String title;
  final String subject;
  final String studentName;
  final DateTime opensAt;
  final DateTime closesAt;
  final int minutes;
  final int questions;
  final double maxMarks;
  final String state;
  final double? score;
  final double? percent;
}

final myTestsProvider = FutureProvider.autoDispose<List<MyTestItem>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<MyTestItem>>('/online-tests/my',
      parse: (d) => [for (final x in (d as List).cast<Map>()) MyTestItem.fromJson(x.cast())]);
  return res.data;
});

String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

class MyTestsScreen extends ConsumerWidget {
  const MyTestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final student = me?.role == 'student';
    final async = ref.watch(myTestsProvider);
    final s = statusColors(context);
    final scheme = Theme.of(context).colorScheme;
    (String, Color) meta(String st) => switch (st) {
          'open' => ('Open now', s.success),
          'in_progress' => ('In progress', s.warning),
          'submitted' => ('Submitted', scheme.primary),
          'missed' => ('Missed', scheme.onSurfaceVariant),
          _ => ('Opens soon', scheme.tertiary),
        };
    return Scaffold(
      appBar: AppBar(title: const Text('Online tests')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myTestsProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(),
          onRetry: () => ref.invalidate(myTestsProvider),
          builder: (list) => list.isEmpty
              ? ListView(children: const [EmptyPanel(icon: Icons.quiz_outlined, title: 'No tests yet')])
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final t = list[i];
                    final (label, color) = meta(t.state);
                    final canTake = student && (t.state == 'open' || t.state == 'in_progress');
                    return Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(t.title, style: const TextStyle(fontWeight: FontWeight.w800))),
                            Pill(label, color: color),
                          ]),
                          Text('${t.subject}${student ? '' : ' · ${t.studentName}'} · ${t.questions} questions · ${t.minutes} min',
                              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                          Text('${_when.format(t.opensAt)} – ${_when.format(t.closesAt)}', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                          if (t.score != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text('Score ${_fmt(t.score!)} of ${_fmt(t.maxMarks)} (${t.percent}%)', style: const TextStyle(fontWeight: FontWeight.w700)),
                            ),
                          if (canTake)
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: FilledButton.icon(
                                onPressed: () async {
                                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TakeTestScreen(testId: t.testId)));
                                  ref.invalidate(myTestsProvider);
                                },
                                icon: const Icon(Icons.play_arrow_rounded),
                                label: Text(t.state == 'open' ? 'Start test' : 'Continue'),
                              ),
                            ),
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

class TakeTestScreen extends ConsumerStatefulWidget {
  const TakeTestScreen({super.key, required this.testId});
  final String testId;

  @override
  ConsumerState<TakeTestScreen> createState() => _TakeTestScreenState();
}

class _TakeTestScreenState extends ConsumerState<TakeTestScreen> {
  Map<String, dynamic>? _paper;
  final Map<String, dynamic> _answers = {};
  String? _error;
  Map<String, dynamic>? _result;
  Timer? _tick;
  Duration _left = Duration.zero;
  bool _sending = false;
  bool _dirty = false;
  int _sinceSave = 0;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    try {
      final res = await _api.post<Map<String, dynamic>>('/online-tests/${widget.testId}/start', parse: (d) => (d as Map).cast());
      final p = res.data;
      setState(() {
        _paper = p;
        _answers.addAll(((p['answers'] as Map?) ?? {}).cast());
      });
      final deadline = DateTime.parse(p['deadline'] as String);
      _tick = Timer.periodic(const Duration(seconds: 1), (_) {
        final left = deadline.difference(DateTime.now());
        setState(() => _left = left.isNegative ? Duration.zero : left);
        if (left.isNegative || left == Duration.zero) {
          _submit();
        } else if (++_sinceSave >= 15 && _dirty) {
          _sinceSave = 0;
          _dirty = false;
          _api.put<Object?>('/online-tests/${widget.testId}/answers', body: {'answers': _answers}).then((_) {}, onError: (_) { _dirty = true; });
        }
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  Future<void> _submit() async {
    if (_sending || _result != null) return;
    _tick?.cancel();
    setState(() => _sending = true);
    try {
      final res = await _api.post<Map<String, dynamic>>('/online-tests/${widget.testId}/submit', body: {'answers': _answers},
          parse: (d) => (d as Map).cast());
      setState(() => _result = res.data);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _set(String q, dynamic v) => setState(() {
        _answers[q] = v;
        _dirty = true;
      });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (_error != null) {
      return Scaffold(appBar: AppBar(title: const Text('Test')), body: ErrorPanel(message: _error!));
    }
    if (_result != null) {
      final r = _result!;
      return Scaffold(
        appBar: AppBar(title: const Text('Submitted')),
        body: ListView(padding: const EdgeInsets.all(24), children: [
          Icon(Icons.check_circle_rounded, size: 64, color: statusColors(context).success),
          const SizedBox(height: 12),
          Text(r['title'] as String, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(r['released'] == true && r['score'] != null ? 'Score ${r['score']} of ${r['max_marks']}' : 'Your teacher will release the results.',
              textAlign: TextAlign.center),
        ]),
      );
    }
    final p = _paper;
    if (p == null) return Scaffold(appBar: AppBar(title: const Text('Test')), body: const SkeletonList());
    final questions = (p['questions'] as List).cast<Map>();
    final mm = _left.inMinutes.toString().padLeft(2, '0');
    final ss = (_left.inSeconds % 60).toString().padLeft(2, '0');
    return Scaffold(
      appBar: AppBar(title: Text(p['title'] as String), actions: [
        Center(child: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Text('$mm:$ss', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18,
              color: _left.inSeconds < 60 ? statusColors(context).danger : null), semanticsLabel: 'Time left $mm minutes $ss seconds'),
        )),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            onPressed: _sending ? null : () async {
              final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
                    title: const Text('Submit the test?'),
                    content: const Text("You can't change answers after submitting."),
                    actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
                              FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Submit'))],
                  ));
              if (ok == true) _submit();
            },
            icon: const Icon(Icons.send_rounded),
            label: const Text('Submit'),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        for (final (i, q) in questions.indexed)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${i + 1}. ${q['text']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                if (q['kind'] == 'short')
                  TextFormField(
                    initialValue: _answers[q['id']] is String ? _answers[q['id']] as String : '',
                    maxLines: 3,
                    onChanged: (v) => _set(q['id'] as String, v),
                    decoration: const InputDecoration(hintText: 'Your answer'),
                  )
                else
                  for (final o in (q['options'] as List).cast<Map>())
                    Builder(builder: (context) {
                      final cur = (_answers[q['id']] as List?)?.cast<String>() ?? const <String>[];
                      final on = cur.contains(o['id']);
                      final multiple = q['kind'] == 'multiple';
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            alignment: Alignment.centerLeft,
                            backgroundColor: on ? scheme.primary.withValues(alpha: 0.12) : null,
                            side: BorderSide(color: on ? scheme.primary : scheme.outline),
                          ),
                          onPressed: () => _set(q['id'] as String, multiple
                              ? (on ? cur.where((x) => x != o['id']).toList() : [...cur, o['id'] as String])
                              : [o['id'] as String]),
                          child: Semantics(selected: on, child: Text(o['text'] as String)),
                        ),
                      );
                    }),
              ]),
            ),
          ),
        const SizedBox(height: 24),
      ]),
    );
  }
}

// ---- live classes -----------------------------------------------------------------------------

class LiveItem {
  LiveItem.fromJson(Map<String, dynamic> j)
      : title = j['title'] as String,
        sections = j['sections_label'] as String,
        subject = j['subject_name'] as String?,
        startsAt = DateTime.parse(j['starts_at'] as String).toLocal(),
        minutes = (j['duration_minutes'] as num).toInt(),
        url = j['meeting_url'] as String,
        provider = j['provider'] as String,
        teacher = j['teacher'] as String?,
        state = j['state'] as String;
  final String title;
  final String sections;
  final String? subject;
  final DateTime startsAt;
  final int minutes;
  final String url;
  final String provider;
  final String? teacher;
  final String state;
}

final liveProvider = FutureProvider.autoDispose<List<LiveItem>>((ref) async {
  final res = await ref.watch(apiClientProvider).get<List<LiveItem>>('/live-classes',
      parse: (d) => [for (final x in (d as List).cast<Map>()) LiveItem.fromJson(x.cast())]);
  return res.data;
});

class LiveClassesScreen extends ConsumerWidget {
  const LiveClassesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(liveProvider);
    final s = statusColors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Live classes')),
      floatingActionButton: ref.watch(meProvider)?.can('live.manage') == true
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.videocam_outlined),
              label: const Text('Schedule'),
              onPressed: () async {
                final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const NewLiveClassScreen()));
                if (done == true) ref.invalidate(liveProvider);
              },
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(liveProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(),
          onRetry: () => ref.invalidate(liveProvider),
          builder: (list) => list.isEmpty
              ? ListView(children: const [EmptyPanel(icon: Icons.videocam_outlined, title: 'No live classes')])
              : ListView(padding: const EdgeInsets.all(12), children: [
                  for (final l in list)
                    Card(
                      child: ListTile(
                        leading: Icon(Icons.videocam_rounded, color: l.state == 'live' ? s.success : null),
                        title: Text(l.title, style: TextStyle(fontWeight: FontWeight.w700,
                            decoration: l.state == 'cancelled' ? TextDecoration.lineThrough : null)),
                        subtitle: Text('${_when.format(l.startsAt)} · ${l.minutes} min · ${l.provider}${l.subject != null ? ' · ${l.subject}' : ''}'),
                        trailing: l.state == 'live' || l.state == 'upcoming'
                            ? FilledButton(
                                style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                                onPressed: () => launchUrl(Uri.parse(l.url), mode: LaunchMode.externalApplication),
                                child: Text(l.state == 'live' ? 'Join now' : 'Join'),
                              )
                            : Text(l.state == 'cancelled' ? 'Cancelled' : 'Ended'),
                      ),
                    ),
                ]),
        ),
      ),
    );
  }
}
