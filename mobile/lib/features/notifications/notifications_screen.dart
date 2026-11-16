import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../shared/paging.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

class AppNotification {
  AppNotification.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      kind = j['kind'] as String,
      title = j['title'] as String,
      body = j['body'] as String?,
      link = j['link'] as String?,
      read = j['read'] as bool,
      createdAt = DateTime.parse(j['created_at'] as String).toLocal();
  final String id;
  final String kind;
  final String title;
  final String? body;
  final String? link;
  final bool read;
  final DateTime createdAt;

  IconData get icon => switch (kind) {
    'notice' => Icons.campaign_outlined,
    'homework' => Icons.menu_book_outlined,
    'absent' => Icons.event_busy_outlined,
    'fee_receipt' => Icons.receipt_long_outlined,
    'results' => Icons.emoji_events_outlined,
    'substitution' => Icons.swap_horiz_rounded,
    'leave' => Icons.event_busy_outlined,
    'online_test' => Icons.quiz_outlined,
    'chat' => Icons.forum_outlined,
    'transport' => Icons.directions_bus_outlined,
    'payslip' => Icons.receipt_long_outlined,
    'staff_leave' => Icons.event_busy_outlined,
    'sos' => Icons.sos_outlined,
    'ptm' => Icons.handshake_outlined,
    'survey' => Icons.poll_outlined,
    'live_class' => Icons.videocam_outlined,
    'fee_reminder' => Icons.notifications_active_outlined,
    'calendar' => Icons.event_note_outlined,
    'enquiry' => Icons.person_add_alt_outlined,
    _ => Icons.notifications_outlined,
  };
}

/// The web paths the API puts in notifications, mapped to screens in this app.
String? appRouteFor(String? link) => link != null && link.startsWith('/messages')
    ? '/messages'
    : switch (link) {
        '/notices' => '/notices',
        '/my-homework' || '/homework' => '/homework',
        '/my-attendance' || '/attendance' => '/attendance',
        '/my-fees' || '/fees' => '/fees',
        '/my-results' => '/results',
        '/my-timetable' => '/timetable',
        '/leave' => '/leave',
        '/calendar' => '/calendar',
        '/my-tests' => '/tests',
        '/live-classes' => '/live',
        '/ptm' => '/ptm',
        '/my-transport' => '/bus',
        '/my-leave' || '/my-payslips' || '/my-hr' => '/my-hr',
        '/surveys' => '/surveys',
        _ => null,
      };

final notificationsProvider = FutureProvider.autoDispose<PagedList<AppNotification>>(
  (ref) => fetchPages(ref.watch(apiClientProvider), '/notifications', ref.watch(pagesProvider('notifications')), AppNotification.fromJson),
);

final unreadNotificationsProvider = FutureProvider.autoDispose<int>((ref) async {
  final res = await ref.watch(apiClientProvider).get<int>('/notifications/unread-count', parse: (d) => ((d as Map)['count'] as num).toInt());
  return res.data;
});

/// A bell for app bars, with the unread count. Opens the notification centre.
/// How each kind of notification looks (theme 4): a two-colour gradient for its icon tile, and the words for its
/// action button (only kinds with a screen to open get one). Also used for pushes shown while the app is open.
class NotificationStyle {
  const NotificationStyle(this.from, this.to, this.label, [this.action]);
  final Color from;
  final Color to;

  /// The group shown in the push header and the filter chips ("Fees", "Homework").
  final String label;
  final String? action;

  static NotificationStyle of(String kind) => switch (kind) {
        'fee_receipt' => const NotificationStyle(Color(0xFF2BC48A), Color(0xFF11915F), 'Fees', 'View receipt'),
        'fee_reminder' => const NotificationStyle(Color(0xFF2BC48A), Color(0xFF11915F), 'Fees', 'Pay fees'),
        'payslip' => const NotificationStyle(Color(0xFF2BC48A), Color(0xFF11915F), 'Salary', 'View payslip'),
        'homework' => const NotificationStyle(Color(0xFF5B8DEF), Color(0xFF2F4A86), 'Homework', 'Open homework'),
        'online_test' => const NotificationStyle(Color(0xFF5B8DEF), Color(0xFF2F4A86), 'Tests', 'Open test'),
        'live_class' => const NotificationStyle(Color(0xFF5B8DEF), Color(0xFF2F4A86), 'Live class', 'Join'),
        'absent' => const NotificationStyle(Color(0xFFF2707A), Color(0xFFD23545), 'Attendance'),
        'leave' || 'staff_leave' => const NotificationStyle(Color(0xFFF2707A), Color(0xFFD23545), 'Leave'),
        'sos' => const NotificationStyle(Color(0xFFF2707A), Color(0xFFD23545), 'Emergency'),
        'results' => const NotificationStyle(Color(0xFFA97BF0), Color(0xFF7446D1), 'Results', 'See results'),
        'transport' => const NotificationStyle(Color(0xFFF7B547), Color(0xFFD9820B), 'Transport', 'Track bus'),
        'substitution' => const NotificationStyle(Color(0xFF8C8CF8), Color(0xFF4F46E5), 'Timetable'),
        'chat' => const NotificationStyle(Color(0xFF3BC3D0), Color(0xFF11879A), 'Messages', 'Reply'),
        _ => const NotificationStyle(Color(0xFF3BC3D0), Color(0xFF11879A), 'Notices'),
      };
}

/// The bell in a rounded box, with a red count of unread notifications (theme 4).
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.watch(unreadNotificationsProvider).value ?? 0;
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.brightness == Brightness.dark ? scheme.surfaceContainerLow : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: SizedBox(
          width: 44,
          height: 44,
          child: IconButton(
            tooltip: n > 0 ? 'Notifications, $n unread' : 'Notifications',
            style: IconButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
            onPressed: () async {
              await context.push('/notifications');
              ref.invalidate(unreadNotificationsProvider);
            },
            icon: Badge(
              isLabelVisible: n > 0,
              backgroundColor: const Color(0xFFE5484D),
              label: Text(n > 99 ? '99+' : '$n'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
        ),
      ),
    );
  }
}

String _when(DateTime t) {
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 1) return 'Just now';
  if (d.inMinutes < 60) return '${d.inMinutes} min ago';
  if (d.inHours < 24) return DateFormat('h:mm a').format(t);
  if (d.inDays < 7) return DateFormat('EEE').format(t);
  return DateFormat('d MMM').format(t);
}

/// Today, Yesterday or Earlier.
String _group(DateTime t) {
  final now = DateTime.now();
  final day = DateTime(t.year, t.month, t.day);
  final today = DateTime(now.year, now.month, now.day);
  if (day == today) return 'Today';
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
  return 'Earlier';
}

/// The filter chips: null kinds means every notification; an empty set means the unread ones.
const _filters = <(String, Set<String>?)>[
  ('All', null),
  ('Unread', <String>{}),
  ('Fees', {'fee_receipt', 'fee_reminder', 'payslip'}),
  ('Homework', {'homework', 'online_test', 'live_class'}),
  ('Attendance', {'absent', 'leave', 'staff_leave'}),
  ('Notices', {'notice', 'calendar', 'ptm', 'survey'}),
];

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  int _filter = 0;

  void _refresh() {
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> _open(AppNotification n) async {
    if (!n.read) {
      await ref.read(apiClientProvider).post<Object?>('/notifications/${n.id}/read').then((_) => _refresh(), onError: (_) {});
    }
    final route = appRouteFor(n.link);
    if (route != null && mounted) {
      // Tabs are switched with go; full-screen pages are pushed on top.
      if (const {'/homework', '/attendance', '/fees'}.contains(route)) {
        context.go(route);
      } else {
        context.push(route);
      }
    }
  }

  bool _matches(AppNotification n) {
    final kinds = _filters[_filter].$2;
    if (kinds == null) return true;
    if (kinds.isEmpty) return !n.read;
    return kinds.contains(n.kind);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notificationsProvider);
    final scheme = Theme.of(context).colorScheme;
    final all = async.value;
    final unread = all?.where((n) => !n.read).length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: () async {
                await ref.read(apiClientProvider).post<Object?>('/notifications/read-all');
                _refresh();
              },
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: Stack(
        children: [
          Positioned(top: 0, left: 0, right: 0, height: 480, child: AppTheme.pageLight(scheme)),
          RefreshIndicator(
            onRefresh: () => ref.refresh(notificationsProvider.future),
            child: AsyncView(
              value: async,
              loading: const SkeletonList(count: 8),
              onRetry: _refresh,
              builder: (list) {
                if (list.isEmpty) {
                  return ListView(
                    children: const [
                      EmptyPanel(
                        icon: Icons.notifications_none_rounded,
                        title: "You're all caught up",
                        message: 'Notices, homework, absences, fee receipts and results will show here.',
                      ),
                    ],
                  );
                }
                final shown = list.where(_matches).toList();
                final groups = <String, List<AppNotification>>{};
                for (final n in shown) {
                  groups.putIfAbsent(_group(n.createdAt), () => []).add(n);
                }
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  children: [
                    _FilterChips(
                      selected: _filter,
                      counts: {0: list.length, 1: unread},
                      onSelect: (i) => setState(() => _filter = i),
                    ),
                    if (shown.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(top: 24),
                        child: EmptyPanel(icon: Icons.filter_list_off_rounded, title: 'Nothing here', message: 'No notifications of this kind yet.'),
                      ),
                    for (final g in groups.entries) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
                        child: Text(
                          g.key.toUpperCase(),
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: scheme.onSurfaceVariant),
                        ),
                      ),
                      Card(
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          children: [
                            for (final (i, n) in g.value.indexed) ...[
                              if (i > 0) Divider(height: 1, indent: 70, color: scheme.outlineVariant),
                              _NotificationRow(n: n, onTap: () => _open(n)),
                            ],
                          ],
                        ),
                      ),
                    ],
                    LoadMoreTile(list: 'notifications', items: list, noun: 'notifications'),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.selected, required this.counts, required this.onSelect});
  final int selected;
  final Map<int, int> counts;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = scheme.brightness == Brightness.dark;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          for (final (i, f) in _filters.indexed)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Semantics(
                selected: i == selected,
                button: true,
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => onSelect(i),
                    child: Ink(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        gradient: i == selected
                            ? LinearGradient(colors: dark ? const [Color(0xFF3D5DA8), Color(0xFF5B7BD0)] : const [Color(0xFF2F4A86), Color(0xFF4A68B5)])
                            : null,
                        color: i == selected ? null : (dark ? scheme.surfaceContainerLow : Colors.white),
                        border: i == selected ? null : Border.all(color: scheme.outlineVariant),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(f.$1, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: i == selected ? Colors.white : scheme.onSurface)),
                          if (counts[i] case final c? when c > 0) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(999),
                                color: i == selected ? Colors.white.withValues(alpha: 0.25) : scheme.surfaceContainer,
                              ),
                              child: Text('$c', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: i == selected ? Colors.white : scheme.onSurfaceVariant)),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One notification: its kind's coloured icon tile, the title and time, the message, and an action button where there
/// is a screen to open. Unread ones are tinted, bold and marked with a dot.
class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.n, required this.onTap});
  final AppNotification n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final style = NotificationStyle.of(n.kind);
    final action = appRouteFor(n.link) != null ? style.action : null;
    return Material(
      color: n.read ? Colors.transparent : scheme.primary.withValues(alpha: 0.05),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [style.from, style.to]),
                      boxShadow: [BoxShadow(color: style.to.withValues(alpha: 0.35), blurRadius: 12, spreadRadius: -6, offset: const Offset(0, 6))],
                    ),
                    child: Icon(n.icon, size: 20, color: Colors.white),
                  ),
                  if (!n.read)
                    Positioned(
                      left: -4,
                      top: -4,
                      child: Container(
                        width: 11,
                        height: 11,
                        decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle, border: Border.all(color: scheme.surface, width: 2)),
                        child: Semantics(label: 'Unread'),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: Text(n.title, style: TextStyle(fontSize: 14.5, fontWeight: n.read ? FontWeight.w600 : FontWeight.w800))),
                        const SizedBox(width: 8),
                        Text(_when(n.createdAt), style: TextStyle(fontSize: 11.5, color: scheme.onSurfaceVariant)),
                      ],
                    ),
                    if (n.body != null) ...[
                      const SizedBox(height: 2),
                      Text(n.body!, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, height: 1.35, color: scheme.onSurfaceVariant)),
                    ],
                    if (action != null) ...[
                      const SizedBox(height: 8),
                      Material(
                        color: scheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: onTap,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                            child: Text(action, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: scheme.primary)),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
