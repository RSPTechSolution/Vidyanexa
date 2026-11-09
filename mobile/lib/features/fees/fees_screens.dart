import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../shared/paging.dart';
import '../../core/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/open_file.dart';
import 'fees_data.dart';

final _date = DateFormat('d MMM yyyy');
final _dateTime = DateFormat('d MMM yyyy, h:mm a');

/// The Fees tab: dues and receipts for families (fees are paid at the school office), collection for office staff.
class FeesScreen extends ConsumerWidget {
  const FeesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    if (me == null) return const SizedBox.shrink();
    return me.isFamily ? const FamilyFeesView() : const StaffFeesView();
  }
}

class InvoiceStatusPill extends StatelessWidget {
  const InvoiceStatusPill(this.inv, {super.key});
  final Invoice inv;

  @override
  Widget build(BuildContext context) {
    final s = statusColors(context);
    if (inv.status == 'paid') return Pill('Paid', color: s.success, icon: Icons.check_circle);
    if (inv.overdue) return Pill('Overdue', color: s.danger, icon: Icons.error_outline);
    if (inv.status == 'partial') return Pill('Part paid', color: s.warning);
    return Pill('Due', color: s.info);
  }
}

// ---- families ------------------------------------------------------------------------------------

class FamilyFeesView extends ConsumerStatefulWidget {
  const FamilyFeesView({super.key});
  @override
  ConsumerState<FamilyFeesView> createState() => _FamilyFeesViewState();
}

class _FamilyFeesViewState extends ConsumerState<FamilyFeesView> {
  int child = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myFeesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Fees')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myFeesProvider.future),
        child: AsyncView(
          value: async,
          loading: const _FeesSkeleton(),
          onRetry: () => ref.invalidate(myFeesProvider),
          builder: (data) {
            if (data.children.isEmpty) {
              return ListView(
                children: const [
                  EmptyPanel(icon: Icons.account_balance_wallet_outlined, title: 'Nothing to show yet', message: 'No student is linked to this account.'),
                ],
              );
            }
            final c = data.children[child.clamp(0, data.children.length - 1)];
            final overdue = data.children.fold<double>(0, (n, x) => n + x.overdue);
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                _DueHero(total: data.totalDue, overdue: overdue, many: data.children.length > 1),
                const SizedBox(height: 12),
                ChildSwitcher(
                  names: [for (final x in data.children) x.name],
                  subtitles: [for (final x in data.children) x.due > 0 ? '${inr(x.due)} due' : 'Paid up'],
                  index: child,
                  onChanged: (i) => setState(() => child = i),
                ),
                for (final inv in c.invoices) _InvoiceCard(inv: inv),
                if (c.invoices.isEmpty) const EmptyPanel(icon: Icons.receipt_long_outlined, title: 'No invoices yet'),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// The family fees screen's shape while it loads: the total-due card, the child chips and two invoice cards.
class _FeesSkeleton extends StatelessWidget {
  const _FeesSkeleton();

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        children: [
          const Bone(height: 128, radius: 20),
          const SizedBox(height: 12),
          const Row(children: [Bone(width: 116, height: 50, radius: 14), SizedBox(width: 8), Bone(width: 116, height: 50, radius: 14)]),
          for (var i = 0; i < 2; i++) ...[
            const SizedBox(height: 10),
            const BoneCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      Bone.circle(40),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [Bone(width: 150, height: 14), SizedBox(height: 8), Bone(width: 100, height: 10)],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [Bone(width: 70, height: 16), SizedBox(height: 6), Bone(width: 50, height: 16, radius: 8)],
                      ),
                    ],
                  ),
                  SizedBox(height: 14),
                  Bone(height: 10),
                  SizedBox(height: 8),
                  Bone(height: 10),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DueHero extends StatelessWidget {
  const _DueHero({required this.total, required this.overdue, required this.many});
  final double total;
  final double overdue;
  final bool many;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: AppTheme.heroPanel(Theme.of(context).colorScheme)),
      child: Stack(
        children: [
          const Positioned(right: -10, bottom: -18, child: Icon(Icons.account_balance_wallet_rounded, size: 110, color: Colors.white10)),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(many ? 'Total due for all children' : 'Total due', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 4),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: total),
                duration: const Duration(milliseconds: 900),
                curve: Curves.easeOutCubic,
                builder: (_, v, _) => Text(
                  inr(v),
                  style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                total == 0
                    ? 'All paid up. Thank you!'
                    : overdue > 0
                    ? '${inr(overdue)} is overdue'
                    : 'Nothing overdue',
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.inv});
  final Invoice inv;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = statusColors(context);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: inv.overdue ? s.danger.withValues(alpha: 0.5) : scheme.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        initiallyExpanded: inv.balance > 0,
        shape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: (inv.balance > 0 ? scheme.primary : s.success).withValues(alpha: 0.12),
          child: Icon(inv.balance > 0 ? Icons.event_note_rounded : Icons.check_rounded, color: inv.balance > 0 ? scheme.primary : s.success),
        ),
        title: Text(inv.term, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('Due ${_date.format(inv.dueDate)}', style: const TextStyle(fontSize: 12)),
        trailing: FittedBox(
          // A list row's corner has a fixed height: with a big phone font the amount and status shrink to fit.
          fit: BoxFit.scaleDown,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(inr(inv.balance > 0 ? inv.balance : inv.net), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              InvoiceStatusPill(inv),
            ],
          ),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
        children: [
          const Divider(),
          for (final (name, amount) in inv.items) _Line(name, inr(amount)),
          if (inv.discount > 0) _Line(inv.discountReason ?? 'Concession', '−${inr(inv.discount)}', color: s.success),
          _Line('Total', inr(inv.net), bold: true),
          if (inv.paid > 0) _Line('Paid', inr(inv.paid)),
          const SizedBox(height: 8),
          for (final p in inv.payments)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.receipt_long_rounded, color: scheme.primary),
              title: Text('${inr(p.amount)} · ${methodLabels[p.method]?.$1 ?? p.method}'),
              subtitle: Text(_dateTime.format(p.paidAt)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/fees/receipt/${p.id}'),
            ),
          // School fees are paid at the school, never online through the app; the office records it.
          if (inv.balance > 0)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: scheme.surfaceContainerHighest.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(12)),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.account_balance_rounded, size: 18, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Pay ${inr(inv.balance)} at the school office (cash, UPI, cheque or bank transfer). Your receipt appears here once it\'s recorded.',
                      style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.bold = false, this.color});
  final String label;
  final String value;
  final bool bold;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: color);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }
}

class StaffFeesView extends ConsumerStatefulWidget {
  const StaffFeesView({super.key});
  @override
  ConsumerState<StaffFeesView> createState() => _StaffFeesViewState();
}

class _StaffFeesViewState extends ConsumerState<StaffFeesView> {
  final _search = TextEditingController();
  String query = '';
  String status = 'due';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(feeSummaryProvider);
    final invoices = ref.watch(invoiceSearchProvider((query, status)));
    final st = statusColors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Fees')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(feeSummaryProvider);
          ref.invalidate(invoiceSearchProvider((query, status)));
          await ref.read(invoiceSearchProvider((query, status)).future);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            summary.when(
              data: (s) => Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                // Equal heights, whatever wraps (big phone fonts).
                child: IntrinsicHeight(
                  child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: _Tile(label: 'Today', value: inr(s.collectedToday), color: st.success, icon: Icons.currency_rupee_rounded),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _Tile(
                        label: 'This month',
                        value: inr(s.collectedMonth),
                        color: Theme.of(context).colorScheme.primary,
                        icon: Icons.trending_up_rounded,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _Tile(label: 'Overdue', value: inr(s.overdue), color: st.danger, icon: Icons.warning_amber_rounded),
                    ),
                  ],
                ),
                ),
              ),
              loading: () => const SkeletonList(count: 1, height: 84),
              error: (_, _) => const SizedBox.shrink(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: 'Student, admission or invoice no.',
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _search.clear();
                            setState(() => query = '');
                          },
                        ),
                ),
                onSubmitted: (v) => setState(() => query = v.trim()),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (final (k, l) in [('due', 'Not fully paid'), ('overdue', 'Overdue'), ('paid', 'Paid')])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(label: Text(l), selected: status == k, onSelected: (_) => setState(() => status = k)),
                    ),
                ],
              ),
            ),
            AsyncView(
              value: invoices,
              loading: const SkeletonList(padding: EdgeInsets.zero),
              onRetry: () => ref.invalidate(invoiceSearchProvider((query, status))),
              builder: (list) => list.isEmpty
                  ? const EmptyPanel(icon: Icons.search_off_rounded, title: 'No invoices match')
                  : Column(
                      children: [
                        for (final inv in list)
                          ListTile(
                            title: Text(inv.studentName, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text('${inv.classSection} · ${inv.term}', maxLines: 1, overflow: TextOverflow.ellipsis),
                            trailing: FittedBox(
                              // A list row's corner has a fixed height: with a big phone font the amount and status shrink to fit.
                              fit: BoxFit.scaleDown,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(inr(inv.balance > 0 ? inv.balance : inv.net), style: const TextStyle(fontWeight: FontWeight.w700)),
                                  InvoiceStatusPill(inv),
                                ],
                              ),
                            ),
                            onTap: () async {
                              await context.push('/fees/invoice/${inv.id}');
                              ref.invalidate(invoiceSearchProvider((query, status)));
                              ref.invalidate(feeSummaryProvider);
                            },
                          ),
                        LoadMoreTile(list: 'invoices:$query:$status', items: list, noun: 'invoices'),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.value, required this.color, required this.icon});
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 6),
          FittedBox(
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ),
          FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant))),
        ],
      ),
    ),
  );
}

class InvoiceScreen extends ConsumerWidget {
  const InvoiceScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invoiceProvider(id));
    final me = ref.watch(meProvider);
    final s = statusColors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: AsyncView(
        value: async,
        loading: const SkeletonDetail(rows: 7),
        onRetry: () => ref.invalidate(invoiceProvider(id)),
        builder: (inv) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(inv.studentName, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            Text('${inv.classSection} · ${inv.admissionNo}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(inv.term, style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                        InvoiceStatusPill(inv),
                      ],
                    ),
                    Text(
                      '${inv.invoiceNo} · due ${_date.format(inv.dueDate)}',
                      style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                    const Divider(height: 24),
                    for (final (name, amount) in inv.items) _Line(name, inr(amount)),
                    if (inv.discount > 0) _Line(inv.discountReason ?? 'Concession', '−${inr(inv.discount)}', color: s.success),
                    _Line('Total', inr(inv.net), bold: true),
                    _Line('Paid', inr(inv.paid)),
                    _Line('Balance', inr(inv.balance), bold: true, color: inv.overdue ? s.danger : null),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            for (final p in inv.payments)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: Icon(methodLabels[p.method]?.$2 ?? Icons.payments_outlined, color: s.success),
                  title: Text('${inr(p.amount)} · ${methodLabels[p.method]?.$1 ?? p.method}'),
                  subtitle: Text('${p.receiptNo} · ${_dateTime.format(p.paidAt)}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/fees/receipt/${p.id}'),
                ),
              ),
            if (inv.balance > 0 && (me?.can('fees.collect') ?? false)) ...[
              const SizedBox(height: 12),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                icon: const Icon(Icons.account_balance_wallet_rounded),
                label: const Text('Collect payment'),
                onPressed: () async {
                  final paid = await showModalBottomSheet<FeePayment>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => CollectSheet(invoice: inv),
                  );
                  if (paid != null && context.mounted) {
                    ref.invalidate(invoiceProvider(id));
                    showSnack(context, '${inr(paid.amount)} received · ${paid.receiptNo}');
                  }
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class CollectSheet extends ConsumerStatefulWidget {
  const CollectSheet({super.key, required this.invoice});
  final Invoice invoice;
  @override
  ConsumerState<CollectSheet> createState() => _CollectSheetState();
}

class _CollectSheetState extends ConsumerState<CollectSheet> {
  late final _amount = TextEditingController(text: widget.invoice.balance.toStringAsFixed(0));
  final _reference = TextEditingController();
  String method = 'cash';
  String? error;
  bool busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final res = await ref
          .read(apiClientProvider)
          .post<FeePayment>(
            '/fees/invoices/${widget.invoice.id}/payments',
            body: {'amount': double.tryParse(_amount.text) ?? 0, 'method': method, 'reference': _reference.text.trim().isEmpty ? null : _reference.text.trim()},
            parse: (d) => FeePayment.fromJson((d as Map).cast()),
          );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context, res.data);
    } on ApiException catch (e) {
      HapticFeedback.heavyImpact();
      setState(() => error = e.fieldErrors.values.firstOrNull ?? e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final needsRef = method == 'cheque' || method == 'bank_transfer';
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Collect payment', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            Text('${widget.invoice.studentName} · ${inr(widget.invoice.balance)} due', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 16),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              decoration: InputDecoration(labelText: 'Amount (₹)', errorText: error),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final m in ['cash', 'upi', 'cheque', 'card', 'bank_transfer'])
                  ChoiceChip(
                    avatar: Icon(methodLabels[m]!.$2, size: 18),
                    label: Text(methodLabels[m]!.$1),
                    selected: method == m,
                    onSelected: (_) => setState(() => method = m),
                  ),
              ],
            ),
            if (method != 'cash') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _reference,
                decoration: InputDecoration(
                  labelText: method == 'cheque'
                      ? 'Cheque number'
                      : method == 'upi'
                      ? 'UPI reference'
                      : 'Reference${needsRef ? '' : ' (optional)'}',
                ),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              child: Text(busy ? 'Recording…' : 'Record payment'),
            ),
          ],
        ),
      ),
    );
  }
}

class ReceiptScreen extends ConsumerWidget {
  const ReceiptScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(receiptProvider(id));
    final s = statusColors(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Receipt'),
        actions: [
          IconButton(
            tooltip: 'Open PDF',
            icon: const Icon(Icons.picture_as_pdf_outlined),
            onPressed: () => openApiFile(context, ref, '/fees/payments/$id/receipt.pdf'),
          ),
        ],
      ),
      body: AsyncView(
        value: async,
        loading: const SkeletonDetail(rows: 6),
        onRetry: () => ref.invalidate(receiptProvider(id)),
        builder: (r) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(r.schoolName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                    if (r.schoolAddress != null) Text(r.schoolAddress!, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    const Divider(height: 28),
                    Center(
                      child: Column(
                        children: [
                          Icon(Icons.verified_rounded, size: 48, color: s.success),
                          const SizedBox(height: 6),
                          Text(inr(r.payment.amount), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
                          Text(
                            'received · ${methodLabels[r.payment.method]?.$1 ?? r.payment.method}',
                            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 28),
                    _Line('Receipt no.', r.payment.receiptNo, bold: true),
                    _Line('Date', _dateTime.format(r.payment.paidAt)),
                    _Line('Student', r.invoice.studentName),
                    _Line('Class', r.invoice.classSection),
                    _Line('For', r.invoice.term),
                    if (r.payment.reference != null) _Line('Reference', r.payment.reference!),
                    if (r.payment.collectedBy != null) _Line('Received by', r.payment.collectedBy!),
                    const Divider(height: 24),
                    _Line('Balance after this payment', inr(r.balanceAfter), bold: true),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
