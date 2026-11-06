import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/form_widgets.dart';

// Staff app: post a notice, add to the school calendar, schedule a live class. The server decides who may do what
// (teachers post only to the classes they teach); the buttons that open these are shown only with the permission.

String _iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
final _day = DateFormat('EEE, d MMM');

/// Classes this person may post to or teach: {id, label}.
final postableSectionsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return (await ref
          .watch(apiClientProvider)
          .get<List<Map<String, dynamic>>>('/notices/sections', parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()]))
      .data;
});

/// Picks classes from [postableSectionsProvider] as chips.
class _SectionChips extends ConsumerWidget {
  const _SectionChips({required this.selected, required this.onChanged});
  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncView(
      value: ref.watch(postableSectionsProvider),
      loading: const LinearProgressIndicator(),
      onRetry: () => ref.invalidate(postableSectionsProvider),
      builder: (list) => list.isEmpty
          ? const Text('You have no classes to choose from.')
          : Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final s in list)
                  FilterChip(
                    label: Text(s['label'] as String),
                    selected: selected.contains(s['id']),
                    onSelected: (on) => onChanged(on ? {...selected, s['id'] as String} : ({...selected}..remove(s['id']))),
                  ),
              ],
            ),
    );
  }
}

/// Shared save handling: shows the server's message in a banner, closes with true on success.
mixin _Saving<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  bool saving = false;
  String? error;

  Future<void> save(String path, Map<String, dynamic> body, String done) async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await ref.read(apiClientProvider).post<Object?>(path, body: body);
      if (mounted) {
        showSnack(context, done);
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      setState(() => error = e.fieldErrors.values.firstOrNull ?? e.message);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

// ---- notice -----------------------------------------------------------------------------------

class NewNoticeScreen extends ConsumerStatefulWidget {
  const NewNoticeScreen({super.key, required this.anyAudience});

  /// Office staff can write to everyone, staff or families; teachers only to their classes.
  final bool anyAudience;

  @override
  ConsumerState<NewNoticeScreen> createState() => _NewNoticeScreenState();
}

class _NewNoticeScreenState extends ConsumerState<NewNoticeScreen> with _Saving {
  final _title = TextEditingController();
  final _body = TextEditingController();
  late String _audience = widget.anyAudience ? 'everyone' : 'sections';
  Set<String> _sections = {};
  String _priority = 'normal';

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  bool get _ready => _title.text.trim().length >= 2 && _body.text.trim().isNotEmpty && (_audience != 'sections' || _sections.isNotEmpty);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New notice')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null) ...[FormBanner(message: error!), const SizedBox(height: 12)],
          const FieldLabel('Title'),
          TextField(
            controller: _title,
            maxLength: 200,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'e.g. School closed on Friday'),
          ),
          const FieldLabel('Notice'),
          TextField(
            controller: _body,
            maxLines: 6,
            maxLength: 5000,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'What parents, students or staff should know'),
          ),
          const FieldLabel('Who sees it'),
          Wrap(
            spacing: 8,
            children: [
              if (widget.anyAudience)
                for (final (k, v) in const [('everyone', 'Everyone'), ('families', 'Parents and students'), ('staff', 'Staff')])
                  ChoiceChip(label: Text(v), selected: _audience == k, onSelected: (_) => setState(() => _audience = k)),
              ChoiceChip(label: const Text('Some classes'), selected: _audience == 'sections', onSelected: (_) => setState(() => _audience = 'sections')),
            ],
          ),
          if (_audience == 'sections') ...[const SizedBox(height: 8), _SectionChips(selected: _sections, onChanged: (s) => setState(() => _sections = s))],
          const SizedBox(height: 16),
          const FieldLabel('Priority'),
          Wrap(
            spacing: 8,
            children: [
              for (final (k, v) in const [('normal', 'Normal'), ('important', 'Important'), ('urgent', 'Urgent')])
                ChoiceChip(label: Text(v), selected: _priority == k, onSelected: (_) => setState(() => _priority = k)),
            ],
          ),
          const SizedBox(height: 24),
          LoadingButton(
            label: 'Post notice',
            loading: saving,
            onPressed: _ready
                ? () => save('/notices', {
                    'title': _title.text.trim(),
                    'body': _body.text.trim(),
                    'audience': _audience,
                    'section_ids': _sections.toList(),
                    'priority': _priority,
                  }, 'Notice posted. Everyone it is for has been told.')
                : null,
          ),
        ],
      ),
    );
  }
}

// ---- calendar event ---------------------------------------------------------------------------

class NewEventScreen extends ConsumerStatefulWidget {
  const NewEventScreen({super.key});

  @override
  ConsumerState<NewEventScreen> createState() => _NewEventScreenState();
}

class _NewEventScreenState extends ConsumerState<NewEventScreen> with _Saving {
  final _title = TextEditingController();
  final _notes = TextEditingController();
  String _kind = 'holiday';
  late DateTime _from = DateTime.now();
  late DateTime _to = _from;

  static const _kinds = [('holiday', 'Holiday'), ('vacation', 'Vacation'), ('event', 'Event'), ('exam', 'Exam'), ('ptm', 'Parent-teacher meeting')];

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pick(bool start) async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: start ? _from : _to,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 730)),
    );
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add to calendar')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null) ...[FormBanner(message: error!), const SizedBox(height: 12)],
          const FieldLabel('What'),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [for (final (k, v) in _kinds) ChoiceChip(label: Text(v), selected: _kind == k, onSelected: (_) => setState(() => _kind = k))],
          ),
          if (_kind == 'holiday' || _kind == 'vacation')
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'The school is closed on these days: no attendance is taken and parents are told.',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
              ),
            ),
          const SizedBox(height: 16),
          const FieldLabel('Title'),
          TextField(
            controller: _title,
            maxLength: 200,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'e.g. Guru Nanak Jayanti'),
          ),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(onPressed: () => _pick(true), icon: const Icon(Icons.event), label: Text(_day.format(_from))),
              ),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('to')),
              Expanded(
                child: OutlinedButton.icon(onPressed: () => _pick(false), icon: const Icon(Icons.event), label: Text(_day.format(_to))),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const FieldLabel('Details (optional)'),
          TextField(controller: _notes, maxLines: 3, maxLength: 2000),
          const SizedBox(height: 16),
          LoadingButton(
            label: 'Add to calendar',
            loading: saving,
            onPressed: _title.text.trim().length >= 2
                ? () => save('/calendar', {
                    'title': _title.text.trim(),
                    'kind': _kind,
                    'start_date': _iso(_from),
                    'end_date': _iso(_to),
                    if (_notes.text.trim().isNotEmpty) 'description': _notes.text.trim(),
                  }, 'Added to the school calendar')
                : null,
          ),
        ],
      ),
    );
  }
}

// ---- live class -------------------------------------------------------------------------------

class NewLiveClassScreen extends ConsumerStatefulWidget {
  const NewLiveClassScreen({super.key});

  @override
  ConsumerState<NewLiveClassScreen> createState() => _NewLiveClassScreenState();
}

class _NewLiveClassScreenState extends ConsumerState<NewLiveClassScreen> with _Saving {
  final _title = TextEditingController();
  final _link = TextEditingController();
  Set<String> _sections = {};
  late DateTime _starts = () {
    final n = DateTime.now().add(const Duration(hours: 1));
    return DateTime(n.year, n.month, n.day, n.hour);
  }();
  int _minutes = 40;

  @override
  void dispose() {
    _title.dispose();
    _link.dispose();
    super.dispose();
  }

  Future<void> _pickWhen() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: _starts, firstDate: now, lastDate: now.add(const Duration(days: 120)));
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_starts));
    if (t == null) return;
    setState(() => _starts = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  @override
  Widget build(BuildContext context) {
    final link = _link.text.trim();
    return Scaffold(
      appBar: AppBar(title: const Text('New live class')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null) ...[FormBanner(message: error!), const SizedBox(height: 12)],
          const FieldLabel('Topic'),
          TextField(
            controller: _title,
            maxLength: 200,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'e.g. Fractions: revision'),
          ),
          const FieldLabel('Classes'),
          _SectionChips(selected: _sections, onChanged: (s) => setState(() => _sections = s)),
          const SizedBox(height: 16),
          const FieldLabel('When'),
          OutlinedButton.icon(onPressed: _pickWhen, icon: const Icon(Icons.schedule), label: Text(DateFormat('EEE, d MMM · h:mm a').format(_starts))),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final m in const [30, 40, 60, 90])
                ChoiceChip(label: Text('$m min'), selected: _minutes == m, onSelected: (_) => setState(() => _minutes = m)),
            ],
          ),
          const SizedBox(height: 16),
          const FieldLabel('Meeting link (optional)'),
          TextField(
            controller: _link,
            keyboardType: TextInputType.url,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'https://meet.google.com/…  Leave empty for a free Jitsi room'),
          ),
          const SizedBox(height: 16),
          LoadingButton(
            label: 'Schedule',
            loading: saving,
            onPressed: _title.text.trim().length >= 2 && _sections.isNotEmpty && (link.isEmpty || link.startsWith('https://'))
                ? () => save('/live-classes', {
                    'title': _title.text.trim(),
                    'section_ids': _sections.toList(),
                    'starts_at': _starts.toUtc().toIso8601String(),
                    'duration_minutes': _minutes,
                    if (link.isNotEmpty) 'meeting_url': link,
                  }, 'Live class scheduled. The classes have been told.')
                : null,
          ),
        ],
      ),
    );
  }
}
