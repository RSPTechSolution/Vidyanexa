import 'package:eduvia/core/api/api_client.dart';
import 'package:eduvia/core/auth/auth_controller.dart';
import 'package:eduvia/core/auth/token_store.dart';
import 'package:eduvia/core/config/app_config.dart';
import 'package:eduvia/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'support/fake_api.dart';

ProviderContainer makeContainer(FakeApi fake, MemoryTokenStore tokens, {AppFlavor flavor = AppFlavor.parent}) {
  return ProviderContainer(retry: apiRetry, overrides: [
    appConfigProvider.overrideWithValue(AppConfig(flavor: flavor, apiBaseUrl: 'http://test')),
    tokenStoreProvider.overrideWithValue(tokens),
    apiClientProvider.overrideWith((ref) {
      final c = ApiClient(baseUrl: 'http://test', tokens: tokens, adapter: fake);
      c.onSessionExpired = () => ref.read(authControllerProvider.notifier).sessionExpired();
      return c;
    }),
  ]);
}

/// The sign-in button sits below the picture: scroll to it first, as a person on a small phone would.
Future<void> tapSignIn(WidgetTester tester) async {
  final button = find.widgetWithText(FilledButton, 'Sign in');
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  group('AuthController', () {
    test('starts signed out with no saved session', () async {
      final c = makeContainer(FakeApi(), MemoryTokenStore());
      expect(await c.read(authControllerProvider.future), isA<SignedOut>());
    });

    test('restores a saved session', () async {
      final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())));
      final c = makeContainer(fake, MemoryTokenStore()..access = 'a'..refresh = 'r');
      final state = await c.read(authControllerProvider.future);
      expect((state as SignedIn).me.firstName, 'Suresh');
    });

    test('signs in and stores tokens', () async {
      final fake = FakeApi()
        ..on('POST /auth/login', (req) {
          expect(req.data['school_slug'], 'demo');
          return (200, FakeApi.ok({'tokens': tokensJson('1'), 'user': meJson()}));
        });
      final tokens = MemoryTokenStore();
      final c = makeContainer(fake, tokens);
      await c.read(authControllerProvider.future);
      await c.read(authControllerProvider.notifier).signIn(email: 'parent@demo.com', password: 'x', schoolSlug: ' demo ');
      expect(c.read(authControllerProvider).value, isA<SignedIn>());
      expect(tokens.refresh, 'refresh-1');
    });

    test('a teacher cannot use the parent app', () async {
      final fake = FakeApi()
        ..on('POST /auth/login', (_) => (200, FakeApi.ok({'tokens': tokensJson('1'), 'user': meJson(role: 'teacher')})))
        ..on('POST /auth/logout', (_) => (200, FakeApi.ok({'message': 'Logged out'})));
      final tokens = MemoryTokenStore();
      final c = makeContainer(fake, tokens);
      await c.read(authControllerProvider.future);
      await expectLater(
        c.read(authControllerProvider.notifier).signIn(email: 't@demo.com', password: 'x', schoolSlug: 'demo'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'WRONG_APP')),
      );
      expect(tokens.refresh, isNull);
      expect(fake.calls, contains('POST /auth/logout'));
      expect((c.read(authControllerProvider).value as SignedOut).notice, contains('Vidyanexa Staff'));
    });
  });

  group('Screens', () {
    Future<void> pumpApp(WidgetTester tester, FakeApi fake, MemoryTokenStore tokens) async {
      await tester.pumpWidget(UncontrolledProviderScope(container: makeContainer(fake, tokens), child: const VidyanexaApp()));
      await tester.pumpAndSettle();
    }

    testWidgets('login validates required fields', (tester) async {
      await pumpApp(tester, FakeApi(), MemoryTokenStore());
      await tapSignIn(tester);
      await tester.pump();
      expect(find.text('Enter your email'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
    });

    testWidgets('the parent app shows the family picture, and the student one for a student', (tester) async {
      Finder art(String name) => find.byWidgetPredicate((w) => w is SvgPicture && (w.bytesLoader as SvgAssetLoader).assetName == 'assets/hero/$name.svg');
      await pumpApp(tester, FakeApi(), MemoryTokenStore());
      expect(art('parent'), findsOneWidget);
      expect(find.text('Every school day, in your hand'), findsOneWidget);
      await tester.tap(find.text("I'm a student"));
      await tester.pumpAndSettle();
      expect(art('student'), findsOneWidget);
      expect(find.text("Ready for today's lessons?"), findsOneWidget);
    });

    testWidgets('the sign-in screen shows the app version', (tester) async {
      await pumpApp(tester, FakeApi(), MemoryTokenStore());
      expect(find.text('Version 1.2.0 (7)'), findsOneWidget);
    });

    testWidgets('with fingerprint unlock on, a saved sign-in opens locked, and signing out leads to the password', (tester) async {
      FlutterSecureStorage.setMockInitialValues({'eduvia.appLock': 'on'});
      addTearDown(() => FlutterSecureStorage.setMockInitialValues({}));
      final fake = FakeApi()
        ..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson())))
        ..on('POST /auth/logout', (_) => (200, FakeApi.ok({})));
      await pumpApp(tester, fake, MemoryTokenStore()..access = 'a'..refresh = 'r');
      expect(find.text('Vidyanexa is locked'), findsOneWidget);
      await tester.tap(find.text('Sign out and use your password'));
      await tester.pumpAndSettle();
      expect(find.text('Vidyanexa is locked'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
    });

    testWidgets('wrong password shows the server message', (tester) async {
      final fake = FakeApi()..on('POST /auth/login', (_) => (401, FakeApi.err('INVALID_CREDENTIALS', 'Invalid email or password')));
      await pumpApp(tester, fake, MemoryTokenStore());
      expect(find.widgetWithText(TextFormField, 'School ID'), findsNothing); // email and password only
      await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'parent@demo.com');
      await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'wrong');
      await tapSignIn(tester);
      await tester.pumpAndSettle();
      expect(find.text('Invalid email or password'), findsOneWidget);
    });

    testWidgets('successful sign-in lands on the home screen', (tester) async {
      final fake = FakeApi()..on('POST /auth/login', (_) => (200, FakeApi.ok({'tokens': tokensJson('1'), 'user': meJson()})));
      await pumpApp(tester, fake, MemoryTokenStore());
      await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'parent@demo.com');
      await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'Demo@1234');
      await tapSignIn(tester);
      await tester.pumpAndSettle();
      expect(find.textContaining('Suresh'), findsOneWidget);
      expect(find.textContaining('GREEN VALLEY PUBLIC SCHOOL'), findsOneWidget);
      // Only modules the school enabled are listed.
      expect(find.text('Fees'), findsOneWidget);
      expect(find.text('Bus tracking'), findsNothing);
    });

    testWidgets('parent signs in with a one-time code sent to their phone', (tester) async {
      Map<String, dynamic>? asked;
      final fake = FakeApi()
        ..on('POST /auth/login-code/request', (req) {
          asked = (req.data as Map).cast<String, dynamic>();
          return (200, FakeApi.ok({'message': 'sent', 'expires_in': 600}));
        })
        ..on('POST /auth/login-code', (req) => (req.data as Map)['code'] == '482913'
            ? (200, FakeApi.ok({'tokens': tokensJson('1'), 'user': meJson()}))
            : (401, FakeApi.err('INVALID_CODE', 'That code is wrong or has expired')));
      await pumpApp(tester, fake, MemoryTokenStore());
      await tester.ensureVisible(find.text('Use a one-time code instead'));
      await tester.tap(find.text('Use a one-time code instead'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Email or mobile number'), '98140 20001');
      await tester.pump();
      await tester.tap(find.text('Send me a code'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(asked, {'identifier': '98140 20001', 'school_slug': null});
      expect(find.textContaining('by SMS and email'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, 'Sign-in code'), '111111');
      await tester.pump();
      await tapSignIn(tester);
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('That code is wrong or has expired'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, 'Sign-in code'), '482913');
      await tester.pump();
      await tapSignIn(tester);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      expect(find.textContaining('Suresh'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 61));
    });

    testWidgets('temporary password forces the change-password screen', (tester) async {
      final fake = FakeApi()..on('GET /auth/me', (_) => (200, FakeApi.ok(meJson(mustChange: true))));
      await pumpApp(tester, fake, MemoryTokenStore()..access = 'a'..refresh = 'r');
      expect(find.text('You signed in with a temporary password. Choose your own to continue.'), findsOneWidget);
    });
  });
}
