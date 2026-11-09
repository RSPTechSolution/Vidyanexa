import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart' show StateProvider;
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';

List<Map<String, dynamic>> _list(Object? d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()];

// ---- messages ---------------------------------------------------------------------------------

final conversationsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/chat/conversations', parse: _list)).data;
});

/// Matches a name, the child's name or the role, ignoring case.
bool _matches(String query, List<Object?> fields) {
  final q = query.trim().toLowerCase();
  return q.isEmpty || fields.any((f) => f != null && f.toString().toLowerCase().contains(q));
}

/// Who to write to, with a search box (a school has hundreds of parents).
class _ContactPicker extends StatefulWidget {
  const _ContactPicker({required this.contacts});
  final List<Map<String, dynamic>> contacts;

  @override
  State<_ContactPicker> createState() => _ContactPickerState();
}

class _ContactPickerState extends State<_ContactPicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final shown = [for (final x in widget.contacts) if (_matches(_q, [x['name'], x['student_name'], x['role']])) x];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (c, scroll) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: TextField(
            autofocus: true,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search by name or child'),
            onChanged: (v) => setState(() => _q = v),
          ),
        ),
        Expanded(
          child: shown.isEmpty
              ? const EmptyPanel(icon: Icons.search_off, title: 'Nobody matches', message: "Try part of the name, or the child's name.")
              : ListView.builder(
                  controller: scroll,
                  itemCount: shown.length,
                  itemBuilder: (_, i) => ListTile(
                    title: Text(shown[i]['name'] as String),
                    subtitle: Text('${shown[i]['role']} · ${shown[i]['student_name']}'),
                    onTap: () => Navigator.pop(context, shown[i]),
                  ),
                ),
        ),
      ]),
    );
  }
}

final _messageSearch = StateProvider.autoDispose<String>((ref) => '');

class MessagesScreen extends ConsumerWidget {
  const MessagesScreen({super.key});

  Future<void> _new(BuildContext context, WidgetRef ref) async {
    final contacts = (await ref.read(apiClientProvider).get<List<Map<String, dynamic>>>('/chat/contacts', parse: _list)).data;
    if (!context.mounted) return;
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => contacts.isEmpty
          ? const EmptyPanel(icon: Icons.people_outline, title: 'There is nobody to message yet')
          : _ContactPicker(contacts: contacts),
    );
    if (picked == null || !context.mounted) return;
    final text = TextEditingController();
    final body = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('To ${picked['name']}'),
        content: TextField(controller: text, maxLines: 4, autofocus: true, decoration: const InputDecoration(hintText: 'Your message')),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
                  FilledButton(onPressed: () => Navigator.pop(c, text.text.trim()), child: const Text('Send'))],
      ),
    );
    if (body == null || body.isEmpty || !context.mounted) return;
    try {
      final conv = (await ref.read(apiClientProvider).post<Map<String, dynamic>>('/chat/conversations',
          body: {'student_id': picked['student_id'], 'user_id': picked['user_id'], 'body': body}, parse: (d) => (d as Map).cast())).data;
      ref.invalidate(conversationsProvider);
      if (context.mounted) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ThreadScreen(conversation: conv)));
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(conversationsProvider);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => _new(context, ref), icon: const Icon(Icons.edit_outlined), label: const Text('New')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(conversationsProvider.future),
        child: AsyncView(
          value: async,
          loading: const SkeletonList(count: 8),
          onRetry: () => ref.invalidate(conversationsProvider),
          builder: (all) {
            if (all.isEmpty) {
              return ListView(children: const [EmptyPanel(icon: Icons.forum_outlined, title: 'No messages yet', message: 'Write to a teacher or a parent.')]);
            }
            final q = ref.watch(_messageSearch);
            final list = [for (final c in all) if (_matches(q, [c['other_name'], c['student_name'], c['last_message']])) c];
            return ListView.separated(
                  itemCount: list.length + 1,
                  separatorBuilder: (_, i) => i == 0 ? const SizedBox.shrink() : const Divider(height: 1),
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                        child: TextField(
                          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search messages'),
                          onChanged: (v) => ref.read(_messageSearch.notifier).state = v,
                        ),
                      );
                    }
                    final c = list[i - 1];
                    final unread = (c['unread'] as num).toInt();
                    return ListTile(
                      leading: CircleAvatar(child: Text((c['other_name'] as String).characters.first)),
                      title: Text(c['other_name'] as String, style: TextStyle(fontWeight: unread > 0 ? FontWeight.w800 : FontWeight.w500)),
                      subtitle: Text('${c['student_name']} · ${c['last_message'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: unread > 0 ? Badge(label: Text('$unread'), backgroundColor: scheme.primary) : null,
                      onTap: () async {
                        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ThreadScreen(conversation: c)));
                        ref.invalidate(conversationsProvider);
                      },
                    );
                  },
                );
          },
        ),
      ),
    );
  }
}

class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.conversation});
  final Map<String, dynamic> conversation;

  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  List<Map<String, dynamic>> _messages = [];
  final _text = TextEditingController();
  Timer? _poll;
  bool _sending = false;

  String get _id => widget.conversation['id'] as String;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final m = (await ref.read(apiClientProvider).get<List<Map<String, dynamic>>>('/chat/conversations/$_id/messages', parse: _list)).data;
      if (mounted) setState(() => _messages = m);
    } on ApiException catch (_) {}
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(apiClientProvider).post<Object?>('/chat/conversations/$_id/messages', body: {'body': body});
      _text.clear();
      await _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = widget.conversation;
    return Scaffold(
      appBar: AppBar(title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(c['other_name'] as String),
        Text('About ${c['student_name']}', style: const TextStyle(fontSize: 12)),
      ])),
      body: Column(children: [
        Expanded(
          child: ListView(reverse: true, padding: const EdgeInsets.all(12), children: [
            for (final m in _messages.reversed)
              Align(
                alignment: m['mine'] == true ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                  decoration: BoxDecoration(
                    color: m['mine'] == true ? scheme.primary : scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(m['body'] as String, style: TextStyle(color: m['mine'] == true ? scheme.onPrimary : null)),
                    Text(DateFormat('d MMM, h:mm a').format(DateTime.parse(m['created_at'] as String).toLocal()),
                        style: TextStyle(fontSize: 10, color: m['mine'] == true ? scheme.onPrimary.withValues(alpha: 0.7) : scheme.onSurfaceVariant)),
                  ]),
                ),
              ),
          ]),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 8, 8),
            child: Row(children: [
              Expanded(child: TextField(controller: _text, minLines: 1, maxLines: 4, decoration: const InputDecoration(hintText: 'Write a message'))),
              IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.send_rounded), tooltip: 'Send'),
            ]),
          ),
        ),
      ]),
    );
  }
}

// ---- parent-teacher meetings ------------------------------------------------------------------

final ptmProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/ptm', parse: _list)).data;
});

final ptmSlotsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) async {
  return (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/ptm/$id/slots', parse: _list)).data;
});

class PtmScreen extends ConsumerWidget {
  const PtmScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(ptmProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Parent-teacher meetings')),
      body: AsyncView(
        value: async,
        loading: const SkeletonList(count: 3, lines: 3),
        onRetry: () => ref.invalidate(ptmProvider),
        builder: (list) => list.isEmpty
            ? const EmptyPanel(icon: Icons.handshake_outlined, title: 'No meetings scheduled')
            : ListView(padding: const EdgeInsets.all(12), children: [for (final e in list) _PtmCard(event: e)]),
      ),
    );
  }
}

class _PtmCard extends ConsumerWidget {
  const _PtmCard({required this.event});
  final Map<String, dynamic> event;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = event['id'] as String;
    final slots = ref.watch(ptmSlotsProvider(id));
    final past = event['past'] == true;
    final scheme = Theme.of(context).colorScheme;
    Future<void> book(String student, String slot) async {
      try {
        await ref.read(apiClientProvider).post<Object?>('/ptm/$id/book', body: {'student_id': student, 'slot': slot});
        ref.invalidate(ptmSlotsProvider(id));
        if (context.mounted) showSnack(context, 'Booked for $slot');
      } on ApiException catch (e) {
        ref.invalidate(ptmSlotsProvider(id));
        if (context.mounted) showSnack(context, e.message, error: true);
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(event['title'] as String, style: const TextStyle(fontWeight: FontWeight.w800)),
          Text('${DateFormat('EEEE d MMMM').format(DateTime.parse(event['date'] as String))} · ${event['start_time']}–${event['end_time']}',
              style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          slots.when(
            loading: () => const Shimmer(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Bone(width: 220, height: 13), SizedBox(height: 8), Bone(width: 160, height: 11), SizedBox(height: 12), Bone(height: 36, radius: 10)])),
            error: (e, _) => Text(e is ApiException ? e.message : 'Could not load'),
            data: (kids) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final k in kids) ...[
                Text('${k['student_name']} · with ${k['teacher_name'] ?? 'class teacher (not assigned)'}', style: const TextStyle(fontWeight: FontWeight.w600)),
                if (k['booking'] != null) Text('Booked at ${k['booking']}', style: TextStyle(color: statusColors(context).success)),
                if (!past)
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    for (final s in (k['slots'] as List).cast<Map>())
                      ChoiceChip(
                        label: Text(s['time'] as String),
                        selected: s['mine'] == true,
                        onSelected: s['free'] == true || s['mine'] == true ? (_) => book(k['student_id'] as String, s['time'] as String) : null,
                      ),
                  ]),
                const SizedBox(height: 10),
              ],
            ]),
          ),
        ]),
      ),
    );
  }
}

// ---- surveys ----------------------------------------------------------------------------------

final surveysProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/surveys', parse: _list)).data;
});

class SurveysScreen extends ConsumerWidget {
  const SurveysScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(surveysProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Surveys')),
      body: AsyncView(
        value: async,
        loading: const SkeletonList(count: 4),
        onRetry: () => ref.invalidate(surveysProvider),
        builder: (list) => list.isEmpty
            ? const EmptyPanel(icon: Icons.poll_outlined, title: 'No surveys')
            : ListView(padding: const EdgeInsets.all(12), children: [
                for (final s in list)
                  Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      title: Text(s['title'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${(s['questions'] as List).length} questions'),
                      trailing: s['answered'] == true
                          ? Icon(Icons.check_circle, color: statusColors(context).success, semanticLabel: 'Answered')
                          : s['open'] == true
                              ? FilledButton(
                                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                                  onPressed: () async {
                                    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => AnswerSurveyScreen(survey: s)));
                                    if (done == true) ref.invalidate(surveysProvider);
                                  },
                                  child: const Text('Answer'))
                              : const Text('Closed'),
                    ),
                  ),
              ]),
      ),
    );
  }
}

class AnswerSurveyScreen extends ConsumerStatefulWidget {
  const AnswerSurveyScreen({super.key, required this.survey});
  final Map<String, dynamic> survey;

  @override
  ConsumerState<AnswerSurveyScreen> createState() => _AnswerSurveyScreenState();
}

class _AnswerSurveyScreenState extends ConsumerState<AnswerSurveyScreen> {
  final Map<String, dynamic> _answers = {};
  bool _sending = false;

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      await ref.read(apiClientProvider).post<Object?>('/surveys/${widget.survey['id']}/respond', body: {'answers': _answers});
      if (mounted) {
        showSnack(context, 'Thank you for your answers');
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.fieldErrors.values.firstOrNull ?? e.message, error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.survey;
    final questions = (s['questions'] as List).cast<Map>();
    return Scaffold(
      appBar: AppBar(title: Text(s['title'] as String)),
      bottomNavigationBar: SafeArea(child: Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton(onPressed: _sending ? null : _send, child: const Text('Send answers')),
      )),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (s['description'] != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(s['description'] as String)),
        for (final (i, q) in questions.indexed) ...[
          Text('${i + 1}. ${q['text']}${q['required'] == true ? ' *' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          switch (q['kind']) {
            'rating' => Row(children: [
                for (var n = 1; n <= 5; n++)
                  IconButton(
                    tooltip: '$n of 5',
                    onPressed: () => setState(() => _answers[q['id'] as String] = n),
                    icon: Icon(((_answers[q['id']] as int?) ?? 0) >= n ? Icons.star_rounded : Icons.star_outline_rounded, color: Colors.amber),
                  ),
              ]),
            'text' => TextField(maxLines: 3, onChanged: (v) => _answers[q['id'] as String] = v),
            'multi' => Column(children: [
                for (final o in (q['options'] as List).cast<String>())
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(o),
                    value: ((_answers[q['id']] as List?) ?? const []).contains(o),
                    onChanged: (v) => setState(() {
                      final cur = List<String>.from((_answers[q['id']] as List?) ?? const []);
                      v == true ? cur.add(o) : cur.remove(o);
                      _answers[q['id'] as String] = cur;
                    }),
                  ),
              ]),
            _ => RadioGroup<String>(
                groupValue: _answers[q['id']] as String?,
                onChanged: (v) => setState(() => _answers[q['id'] as String] = v),
                child: Column(children: [
                  for (final o in (q['options'] as List).cast<String>()) RadioListTile<String>(contentPadding: EdgeInsets.zero, title: Text(o), value: o),
                ]),
              ),
          },
          const SizedBox(height: 14),
        ],
      ]),
    );
  }
}
