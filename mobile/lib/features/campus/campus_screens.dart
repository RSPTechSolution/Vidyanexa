import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';

List<Map<String, dynamic>> _list(Object? d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()];
final _d = DateFormat('d MMM yyyy');

final myBooksProvider = FutureProvider.autoDispose((ref) async =>
    (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/library/mine', parse: _list)).data);
final myHostelProvider = FutureProvider.autoDispose((ref) async =>
    (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/hostels/mine', parse: _list)).data);

/// Books borrowed from the school library: due dates and late fines.
class MyLibraryScreen extends ConsumerWidget {
  const MyLibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final books = ref.watch(myBooksProvider);
    final colors = statusColors(context);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Library books')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myBooksProvider),
        child: AsyncView(
          value: books,
          loading: const SkeletonList(count: 4),
          onRetry: () => ref.invalidate(myBooksProvider),
          builder: (rows) {
            if (rows.isEmpty) {
              return ListView(children: const [EmptyPanel(icon: Icons.menu_book_outlined, title: 'No library books', message: 'Books borrowed from the library will show here.')]);
            }
            final out = rows.where((r) => r['returned_on'] == null).toList();
            final past = rows.where((r) => r['returned_on'] != null).toList();
            return ListView(padding: const EdgeInsets.all(12), children: [
              if (out.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('Nothing borrowed right now.')),
              for (final b in out)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: Icon(Icons.menu_book_outlined, color: scheme.primary),
                    title: Text(b['title'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${b['borrower']} · copy ${b['accession_no']}\n'
                        '${(b['overdue_days'] as int) > 0 ? '${b['overdue_days']} days late · fine so far ${inr(b['fine'] as num)}' : 'Return by ${_d.format(DateTime.parse(b['due_on'] as String))}'}'),
                    isThreeLine: true,
                    trailing: (b['overdue_days'] as int) > 0 ? Pill('Overdue', color: colors.danger) : Pill('Borrowed', color: colors.success),
                  ),
                ),
              if (past.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Returned', style: Theme.of(context).textTheme.titleMedium),
                for (final b in past)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(b['title'] as String),
                    subtitle: Text('${b['borrower']} · returned ${_d.format(DateTime.parse(b['returned_on'] as String))}'
                        '${(b['fine'] as num) > 0 ? ' · fine ${inr(b['fine'] as num)} ${b['fine_paid'] == true ? 'paid' : 'due'}' : ''}'),
                  ),
              ],
            ]);
          },
        ),
      ),
    );
  }
}

/// Families: hostel, room and warden.
class MyHostelScreen extends ConsumerWidget {
  const MyHostelScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hostel = ref.watch(myHostelProvider);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Hostel')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myHostelProvider),
        child: AsyncView(
          value: hostel,
          loading: const SkeletonDetail(rows: 5),
          onRetry: () => ref.invalidate(myHostelProvider),
          builder: (rows) => rows.isEmpty
              ? ListView(children: const [EmptyPanel(icon: Icons.hotel_outlined, title: 'Not staying in a hostel')])
              : ListView(padding: const EdgeInsets.all(12), children: [
                  for (final h in rows)
                    Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(h['name'] as String, style: TextStyle(color: scheme.onSurfaceVariant)),
                          const SizedBox(height: 4),
                          Text('${h['hostel']} · Room ${h['room']}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                          Text('${h['floor'] != null ? '${h['floor']} floor · ' : ''}since ${_d.format(DateTime.parse(h['since'] as String))}',
                              style: TextStyle(color: scheme.onSurfaceVariant)),
                          if (h['warden'] != null) ...[
                            const SizedBox(height: 12),
                            Row(children: [
                              Expanded(child: Text('Warden: ${h['warden']}')),
                              if (h['warden_phone'] != null)
                                OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                                  onPressed: () => launchUrl(Uri.parse('tel:${(h['warden_phone'] as String).replaceAll(' ', '')}')),
                                  icon: const Icon(Icons.call_outlined),
                                  label: const Text('Call'),
                                ),
                            ]),
                          ],
                        ]),
                      ),
                    ),
                ]),
        ),
      ),
    );
  }
}
