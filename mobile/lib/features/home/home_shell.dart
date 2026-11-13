import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/offline.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/models.dart';
import '../../core/auth/session.dart';

/// Branch order in the router. The bar shows only the ones this user can use; everything else is under More.
enum Tab { home, attendance, homework, fees, more }

bool tabVisible(Tab tab, Me me) => switch (tab) {
  Tab.home || Tab.more => true,
  Tab.attendance => me.hasModule('attendance') && (me.isFamily || me.can('attendance.view')),
  Tab.homework => me.hasModule('academics') && (me.isFamily || me.can('homework.manage')),
  Tab.fees => me.hasModule('fees') && (me.isFamily || me.can('fees.view')),
};

const _destinations = {
  Tab.home: NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
  Tab.attendance: NavigationDestination(icon: Icon(Icons.fact_check_outlined), selectedIcon: Icon(Icons.fact_check_rounded), label: 'Attendance'),
  Tab.homework: NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book_rounded), label: 'Homework'),
  Tab.fees: NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet_rounded), label: 'Fees'),
  Tab.more: NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'More'),
};

class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    // The school's trial is over (or its plan ran out): nothing works until it pays, so say so instead of every
    // screen showing an error.
    final ended = me?.school?.subscriptionEnded;
    if (ended != null) return SubscriptionEndedScreen(reason: ended);
    final tabs = me == null ? [Tab.home, Tab.more] : Tab.values.where((t) => tabVisible(t, me)).toList();
    final current = Tab.values[shell.currentIndex];
    final selected = tabs.indexOf(current);
    return Scaffold(
      body: shell,
      // Just above the tab bar, so it never pushes the screen's own header around.
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const OfflineBanner(),
          // Phones set to a bigger font size (Samsung's default is) would wrap "Attendance" onto two lines; the
          // tab labels stay at normal size, everything else on screen still follows the phone's setting.
          MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1.0,
            child: NavigationBar(
              selectedIndex: selected < 0 ? 0 : selected,
              onDestinationSelected: (i) {
                final branch = tabs[i].index;
                shell.goBranch(branch, initialLocation: branch == shell.currentIndex);
              },
              destinations: [for (final t in tabs) _destinations[t]!],
            ),
          ),
        ],
      ),
    );
  }
}

/// A slim bar above the tabs while the app can't reach the school: what you see was saved at a given time, and
/// any changes made meanwhile wait on the phone. "Try again" sends them (and refreshes) when the connection is back.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListenableBuilder(
      listenable: Listenable.merge([offlineSince, pendingChanges]),
      builder: (context, _) {
        final since = offlineSince.value;
        final waiting = pendingChanges.value;
        final show = since != null || waiting > 0;
        final scheme = Theme.of(context).colorScheme;
        final when = since == null
            ? ''
            : DateUtils.isSameDay(since, DateTime.now())
            ? DateFormat('h:mm a').format(since)
            : DateFormat('d MMM, h:mm a').format(since);
        final text = [
          if (since != null) "You're offline · showing data from $when",
          if (waiting > 0) '$waiting ${waiting == 1 ? 'change' : 'changes'} waiting to send',
        ].join(' · ');
        return AnimatedSize(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
          child: !show
              ? const SizedBox(width: double.infinity)
              : Material(
                  color: scheme.tertiaryContainer,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 6, 4, 6),
                    child: Row(
                      children: [
                        Icon(since != null ? Icons.cloud_off_rounded : Icons.cloud_upload_outlined, size: 18, color: scheme.onTertiaryContainer),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            text,
                            style: TextStyle(fontSize: 12.5, color: scheme.onTertiaryContainer),
                            semanticsLabel: text,
                          ),
                        ),
                        TextButton(
                          onPressed: () async {
                            final api = ref.read(apiClientProvider);
                            final sent = await api.flushPending();
                            await ref.read(authControllerProvider.notifier).refreshProfile();
                            if (sent > 0 && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Sent $sent waiting ${sent == 1 ? 'change' : 'changes'}')));
                            }
                          },
                          child: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                ),
        );
      },
    );
  }
}

/// In place of the whole app while the school's subscription has ended. The school renews on the website.
class SubscriptionEndedScreen extends ConsumerWidget {
  const SubscriptionEndedScreen({super.key, required this.reason});
  final String reason;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final title = switch (reason) {
      'trial' => "Your school's free trial has ended",
      'cancelled' => "Your school's subscription was cancelled",
      _ => "Your school's plan has expired",
    };
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.lock_clock_outlined, size: 56, color: theme.colorScheme.primary),
            const SizedBox(height: 16),
            Text(title, textAlign: TextAlign.center, style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              "Vidyanexa is paused for your school. Everything is kept safe and comes back as soon as the school renews. "
              "Please contact the school office.",
              textAlign: TextAlign.center,
              style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: () => ref.read(authControllerProvider.notifier).refreshProfile(),
              child: const Text('Check again'),
            ),
            TextButton(onPressed: () => ref.read(authControllerProvider.notifier).signOut(), child: const Text('Sign out')),
          ]),
        ),
      ),
    );
  }
}
