import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/api/api_client.dart';
import 'core/auth/auth_controller.dart';
import 'core/router/app_router.dart';
import 'core/auth/session.dart';
import 'core/push/push.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode.dart';
import 'shared/widgets/motion.dart';
import 'features/auth/lock_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(retry: apiRetry, child: VidyanexaApp()));
}

class VidyanexaApp extends ConsumerWidget {
  const VidyanexaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flavor = ref.watch(appConfigProvider).flavor;
    // Push notifications for whoever is signed in on this phone.
    ref.listen(authControllerProvider, (prev, next) {
      if (next.value is SignedIn && prev?.value is! SignedIn) ref.read(pushProvider).signedIn();
    });
    final accent = ref.watch(meProvider.select((me) => me?.school?.brandColor));
    return MaterialApp.router(
      title: flavor.title,
      debugShowCheckedModeBanner: false,
      // The school's accent colour, once we know who's signed in.
      theme: AppTheme.light(accent),
      darkTheme: AppTheme.dark(accent),
      themeMode: ref.watch(themeModeProvider),
      scrollBehavior: const AppScrollBehavior(),
      routerConfig: ref.watch(routerProvider),
      // Fingerprint or face unlock, when it is turned on, covers everything.
      builder: (context, child) => LockGate(child: child ?? const SizedBox.shrink()),
    );
  }
}
