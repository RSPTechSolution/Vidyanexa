import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/offline.dart';
import '../config/app_config.dart';
import '../push/push.dart';
import 'models.dart';
import 'token_store.dart';

final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final client = ApiClient(baseUrl: config.apiBaseUrl, tokens: ref.watch(tokenStoreProvider), store: PrefsStore());
  // Count (and try to send) changes left waiting from the last time the app was open.
  client.queue.all().then((list) {
    pendingChanges.value = list.length;
    if (list.isNotEmpty) client.flushPending();
  });
  // Refresh failed: drop to the sign-in screen.
  client.onSessionExpired = () => ref.read(authControllerProvider.notifier).sessionExpired();
  return client;
});

sealed class AuthState {
  const AuthState();
}

class SignedOut extends AuthState {
  const SignedOut({this.notice});

  /// Shown on the sign-in screen, e.g. "Your session expired".
  final String? notice;
}

class SignedIn extends AuthState {
  const SignedIn(this.me);
  final Me me;
}

class AuthController extends AsyncNotifier<AuthState> {
  ApiClient get _api => ref.read(apiClientProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);
  AppFlavor get _flavor => ref.read(appConfigProvider).flavor;

  @override
  Future<AuthState> build() async {
    if (await _tokens.refreshToken() == null) return const SignedOut();
    try {
      final me = await _fetchMe();
      return await _rejectIfWrongApp(me) ?? SignedIn(me);
    } on ApiException catch (e) {
      // Offline at launch: keep tokens, ask the user to retry rather than signing them out.
      if (e.isNetwork) rethrow;
      await _tokens.clear();
      return const SignedOut();
    }
  }

  Future<Me> _fetchMe() async => (await _api.get<Me>('/auth/me', parse: (j) => Me.fromJson((j as Map).cast<String, dynamic>()))).data;

  /// Signs out and returns a SignedOut state if this account can't use this app.
  Future<SignedOut?> _rejectIfWrongApp(Me me) async {
    if (_flavor.allowedRoles.contains(me.role)) return null;
    await _signOutQuietly();
    return SignedOut(notice: "This account (${roleLabel(me.role)}) can't use ${_flavor.title}. ${_flavor.otherAppHint}");
  }

  /// Throws [ApiException] with the server's message on failure.
  Future<void> signIn({required String email, required String password, String? schoolSlug}) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      auth: false,
      body: {'email': email.trim(), 'password': password, 'school_slug': (schoolSlug?.trim().isEmpty ?? true) ? null : schoolSlug!.trim()},
      parse: (j) => (j as Map).cast<String, dynamic>(),
    );
    await _finishSignIn(res.data);
  }

  Future<void> _finishSignIn(Map<String, dynamic> data) async {
    final tokens = (data['tokens'] as Map).cast<String, dynamic>();
    await _tokens.save(access: tokens['access_token'] as String, refresh: tokens['refresh_token'] as String);
    final me = Me.fromJson((data['user'] as Map).cast<String, dynamic>());
    final rejected = await _rejectIfWrongApp(me);
    if (rejected != null) {
      state = AsyncData(rejected);
      throw ApiException(rejected.notice!, code: 'WRONG_APP');
    }
    state = AsyncData(SignedIn(me));
  }

  String? _slug(String? s) => (s?.trim().isEmpty ?? true) ? null : s!.trim().toLowerCase();

  /// Sends a 6-digit sign-in code by email (and SMS for a mobile number). Returns the code only in local debug setups.
  Future<String?> requestLoginCode({required String identifier, String? schoolSlug}) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/login-code/request',
      auth: false,
      body: {'identifier': identifier.trim(), 'school_slug': _slug(schoolSlug)},
      parse: (j) => (j as Map).cast<String, dynamic>(),
    );
    return res.data['debug_code'] as String?;
  }

  /// Throws [ApiException] with the server's message on failure.
  Future<void> signInWithCode({required String identifier, required String code, String? schoolSlug}) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/login-code',
      auth: false,
      body: {'identifier': identifier.trim(), 'code': code.trim(), 'school_slug': _slug(schoolSlug)},
      parse: (j) => (j as Map).cast<String, dynamic>(),
    );
    await _finishSignIn(res.data);
  }

  Future<void> refreshProfile() async {
    final me = await _fetchMe();
    state = AsyncData(SignedIn(me));
  }

  Future<void> changePassword(String current, String next) async {
    await _api.post('/auth/change-password', body: {'current_password': current, 'new_password': next});
    await refreshProfile();
  }

  Future<void> requestPasswordReset(String email, String? schoolSlug) => _api.post(
    '/auth/password-reset/request',
    auth: false,
    body: {'email': email.trim(), 'school_slug': (schoolSlug?.trim().isEmpty ?? true) ? null : schoolSlug!.trim()},
  );

  Future<void> signOut() async {
    await _signOutQuietly();
    state = const AsyncData(SignedOut());
  }

  Future<void> _signOutQuietly() async {
    await ref.read(pushProvider).signingOut(); // while still signed in
    try {
      await _api.post('/auth/logout');
    } catch (e) {
      debugPrint('logout request failed: $e'); // tokens are cleared regardless
    }
    await _tokens.clear();
    // Nothing of this person's stays on the phone for the next one: saved answers and unsent changes go too.
    await _api.clearSaved();
    await _api.queue.clear();
  }

  void sessionExpired() {
    state = const AsyncData(SignedOut(notice: 'Your session expired. Please sign in again.'));
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
