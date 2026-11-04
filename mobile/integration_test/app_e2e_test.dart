// End-to-end check of a real app build against a running API: signs in through the login screen, then opens every
// bottom tab and every item on the More screen, and fails if any of them shows an error or throws.
//
//   flutter test integration_test/app_e2e_test.dart --flavor staff -d emulator-5554 \
//     --dart-define=FLAVOR=staff --dart-define=API_URL=http://10.0.2.2:8000 \
//     --dart-define=E2E_EMAIL=teacher@demo.com --dart-define=E2E_PASSWORD=Demo@1234
import 'package:eduvia/core/api/api_client.dart';
import 'package:eduvia/core/auth/auth_controller.dart';
import 'package:eduvia/main.dart';
import 'package:eduvia/shared/widgets/common.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:eduvia/core/router/app_router.dart';
import 'package:integration_test/integration_test.dart';

const _email = String.fromEnvironment('E2E_EMAIL');
const _password = String.fromEnvironment(
  'E2E_PASSWORD',
  defaultValue: 'Demo@1234',
);

/// Pumps frames for [seconds] (screens with live maps or shimmer never "settle").
Future<void> _wait(WidgetTester tester, [double seconds = 3]) async {
  for (var i = 0; i < seconds * 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _waitFor(WidgetTester tester, Finder f, {int seconds = 30}) async {
  for (var i = 0; i < seconds * 10; i++) {
    if (f.evaluate().isNotEmpty) return;
    await tester.pump(const Duration(milliseconds: 100));
  }
  throw TestFailure('Timed out waiting for $f');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign in as $_email and open every screen', (tester) async {
    final errors = <String>[];
    final screen = <String>['sign-in'];
    final original = FlutterError.onError;
    FlutterError.onError = (d) => errors.add(
      '${screen.last}: ${d.exceptionAsString().split('\n').first}',
    );

    final container = ProviderContainer(retry: apiRetry);
    try {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const VidyanexaApp(),
        ),
      );
      final router = container.read(routerProvider);

      // Start signed out (a previous run may have left a session on the phone).
      await _waitFor(
        tester,
        find.byWidgetPredicate((w) => w is NavigationBar || w is TextFormField),
      );
      if (container.read(authControllerProvider).value is SignedIn) {
        await container.read(authControllerProvider.notifier).signOut();
        await _waitFor(tester, find.widgetWithText(TextFormField, 'Email'));
      }

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        _email,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        _password,
      );
      final signIn = find.widgetWithText(FilledButton, 'Sign in');
      await tester.ensureVisible(signIn);
      await tester.pump();
      await tester.tap(signIn);
      await _waitFor(tester, find.byType(NavigationBar));
      await _wait(tester, 4); // home loads; push registration runs

      final visited = <String>[];
      void check(String name) {
        visited.add(name);
        for (final e in find.byType(ErrorPanel).evaluate()) {
          errors.add(
            '$name: shows an error: ${(e.widget as ErrorPanel).message}',
          );
        }
      }

      // Every bottom tab.
      final tabs = tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((d) => d.label)
          .toList();
      for (final tab in tabs) {
        screen.add('tab $tab');
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationBar),
            matching: find.text(tab),
          ),
        );
        await _wait(tester);
        check('tab $tab');
      }

      // Every item on the More screen, the way a person opens it.
      final moreTiles = find.descendant(
        of: find.byType(ListView),
        matching: find.byWidgetPredicate(
          (w) => w is ListTile && w.onTap != null && w.title is Text,
        ),
      );
      final titles = tester
          .widgetList<ListTile>(moreTiles)
          .map((t) => (t.title as Text).data!)
          .toList();
      expect(titles, isNotEmpty, reason: 'More screen lists nothing');
      for (final title in titles) {
        screen.add(title);
        final tile = find.widgetWithText(ListTile, title).first;
        await tester.scrollUntilVisible(
          tile,
          200,
          scrollable: find.byType(Scrollable).last,
        );
        await tester.tap(tile);
        await _wait(tester);
        check(title);
        router.pop();
        await _wait(tester, 1);
      }

      debugPrint(
        'E2E $_email visited ${visited.length} screens: ${visited.join(', ')}',
      );
    } finally {
      FlutterError.onError = original; // restored even when a step above fails
    }
    container.dispose();
    expect(errors, isEmpty, reason: errors.join('\n'));
  });
}
