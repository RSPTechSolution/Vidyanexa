import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

import 'auth_controller.dart';

/// Whether the app asks for a fingerprint, face or the phone's screen lock before showing anything.
enum AppLockState { checking, locked, unlocked }

class AppLock {
  const AppLock({required this.enabled, required this.state});
  final bool enabled;
  final AppLockState state;

  bool get showing => state != AppLockState.unlocked;
}

/// Fingerprint or face unlock, chosen in Profile & settings and remembered on the phone.
///
/// When it is on, the app is locked when it opens with a saved sign-in, and again when it comes back after
/// [relockAfter] away. Signing in with the password unlocks it.
class AppLockController extends Notifier<AppLock> {
  static const _key = 'eduvia.appLock';
  static const relockAfter = Duration(minutes: 2);
  final _storage = const FlutterSecureStorage();
  final _auth = LocalAuthentication();
  DateTime? _hiddenAt;
  bool _signedOut = false;

  @override
  AppLock build() {
    final lifecycle = AppLifecycleListener(onHide: _onHide, onShow: _onShow);
    ref.onDispose(lifecycle.dispose);
    _load();
    return const AppLock(enabled: false, state: AppLockState.checking);
  }

  Future<void> _load() async {
    var on = false;
    try {
      // A storage that doesn't answer must not leave the app covered.
      on = await _storage.read(key: _key).timeout(const Duration(seconds: 3)) == 'on';
    } catch (_) {} // storage unavailable: no lock
    state = AppLock(enabled: on, state: on ? AppLockState.locked : AppLockState.unlocked);
  }

  void _onHide() => _hiddenAt = DateTime.now();

  void _onShow() {
    final away = _hiddenAt == null ? Duration.zero : DateTime.now().difference(_hiddenAt!);
    _hiddenAt = null;
    if (state.enabled && state.state == AppLockState.unlocked && away >= relockAfter) {
      state = AppLock(enabled: true, state: AppLockState.locked);
    }
  }

  /// Signing in with the password proves who it is: no lock straight after. A sign-in restored at launch stays locked.
  void onAuth(AuthState? auth) {
    if (auth is SignedOut) {
      _signedOut = true;
    } else if (auth is SignedIn && _signedOut) {
      _signedOut = false;
      state = AppLock(enabled: state.enabled, state: AppLockState.unlocked);
    }
  }

  /// Fingerprint, face or the phone's PIN can be used on this phone.
  Future<bool> available() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  Future<bool> _confirm(String reason) async {
    try {
      return await _auth.authenticate(localizedReason: reason, persistAcrossBackgrounding: true);
    } catch (_) {
      return false; // cancelled, locked out or not set up
    }
  }

  /// Shows the system prompt; true when it was the owner.
  Future<bool> unlock() async {
    final ok = await _confirm('Unlock Vidyanexa');
    if (ok) state = AppLock(enabled: state.enabled, state: AppLockState.unlocked);
    return ok;
  }

  /// Turning it on asks for the fingerprint first, so nobody is locked out by a sensor that doesn't work.
  Future<bool> setEnabled(bool on) async {
    if (on && !await _confirm('Confirm it is you to turn on fingerprint unlock')) return false;
    try {
      await _storage.write(key: _key, value: on ? 'on' : 'off');
    } catch (_) {
      return false;
    }
    state = AppLock(enabled: on, state: AppLockState.unlocked);
    return true;
  }
}

final appLockProvider = NotifierProvider<AppLockController, AppLock>(AppLockController.new);
