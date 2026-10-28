import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/auth/models.dart';
import '../../core/theme/theme_mode.dart';
import 'connections.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text("You'll need your email and password to sign in again."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), style: FilledButton.styleFrom(minimumSize: const Size(0, 40)), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok == true) await ref.read(authControllerProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).value;
    if (auth is! SignedIn) return const SizedBox.shrink();
    final me = auth.me;
    final scheme = Theme.of(context).colorScheme;
    final mode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: scheme.primary.withValues(alpha: 0.12),
                  child: Text(me.initials, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: scheme.primary)),
                ),
                const SizedBox(height: 12),
                Text(me.fullName, style: Theme.of(context).textTheme.titleLarge),
                Text(me.email, style: TextStyle(color: scheme.onSurfaceVariant)),
                const SizedBox(height: 16),
                _Row('Role', roleLabel(me.role)),
                if (me.school != null) _Row('School', me.school!.name),
                if (me.phone != null) _Row('Phone', me.phone!),
                _Row('Last sign-in', me.lastLoginAt == null ? '—' : DateFormat('d MMM yyyy, h:mm a').format(me.lastLoginAt!.toLocal())),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          if (me.school != null) ...[const ConnectedToYou(), const SizedBox(height: 16)],
          Card(
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.lock_outline),
                title: const Text('Change password'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/change-password'),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Appearance', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 10),
                  SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined), label: Text('Light')),
                      ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined), label: Text('Dark')),
                      ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined), label: Text('Auto')),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) => ref.read(themeModeProvider.notifier).set(s.first),
                  ),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, ref),
            icon: Icon(Icons.logout, color: scheme.error),
            label: Text('Sign out', style: TextStyle(color: scheme.error)),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(children: [
          Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(width: 16),
          Expanded(child: Text(value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w500))),
        ]),
      );
}
