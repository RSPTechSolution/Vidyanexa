import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/app_lock.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/brand.dart';

/// Covers the app while it is locked; what was open underneath stays as it was.
class LockGate extends ConsumerWidget {
  const LockGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(authControllerProvider, (_, next) => ref.read(appLockProvider.notifier).onAuth(next.value));
    final signedIn = ref.watch(authControllerProvider).value is SignedIn;
    final lock = ref.watch(appLockProvider);
    return Stack(children: [
      child,
      if (signedIn && lock.showing) Positioned.fill(child: LockScreen(checking: lock.state == AppLockState.checking)),
    ]);
  }
}

class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key, this.checking = false});

  /// Still finding out whether the lock is on: a plain cover, so nothing private flashes up.
  final bool checking;

  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  bool _asked = false;
  bool _busy = false;
  bool _failed = false;

  Future<void> _unlock() async {
    setState(() {
      _busy = true;
      _failed = false;
    });
    final ok = await ref.read(appLockProvider.notifier).unlock();
    if (mounted && !ok) {
      setState(() {
        _busy = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Ask straight away the first time the lock shows, as banking apps do.
    if (!widget.checking && !_asked) {
      _asked = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _unlock();
      });
    }
    return Material(
      color: theme.colorScheme.surface,
      child: SafeArea(
        child: widget.checking
            ? const SizedBox.expand()
            : Padding(
                padding: const EdgeInsets.all(32),
                child: Column(children: [
                  const Spacer(),
                  const BrandMark(size: 64),
                  const SizedBox(height: 14),
                  const Wordmark(fontSize: 22),
                  const SizedBox(height: 28),
                  Icon(Icons.fingerprint, size: 56, color: theme.colorScheme.primary),
                  const SizedBox(height: 12),
                  Text('Vidyanexa is locked', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(
                    _failed ? 'Tap Unlock to try again, or sign out and use your password.' : 'Use your fingerprint, face or phone PIN to open it.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: 220,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _unlock,
                      icon: const Icon(Icons.lock_open_rounded),
                      label: const Text('Unlock'),
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
                    child: const Text('Sign out and use your password'),
                  ),
                ]),
              ),
      ),
    );
  }
}
