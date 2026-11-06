import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/notifications/notifications_screen.dart';
import '../auth/auth_controller.dart';
import '../router/app_router.dart';
import 'firebase_ios.dart';

/// Push notifications through Firebase Cloud Messaging. After sign-in the phone's token is sent to the API
/// (POST /notifications/devices), which pushes every in-app notification to it; sign-out removes it again.
///
/// A build without its Firebase config (Android: `android/app/src/<flavor>/google-services.json`; iOS: firebase_ios.dart) has no Firebase: push stays off and the
/// in-app notifications work as before.
///
/// The classic FCM registration token is used (getToken, onTokenRefresh, deleteToken): the API sends to it with the
/// HTTP v1 `message.token` field. Their replacements (register/onRegistered) give an installation ID instead, which
/// would need a different send on the server.
// ignore_for_file: deprecated_member_use
final pushProvider = Provider<Push>((ref) => Push(ref));

class Push {
  Push(this._ref);

  final Ref _ref;
  final _local = FlutterLocalNotificationsPlugin();
  bool _started = false;
  bool _available = false;
  String? _token;
  String? _pendingLink; // a notification tapped while the app was closed, opened once signed in

  /// The channel every school notification uses (also the default for pushes shown while the app is closed).
  static const _channel = AndroidNotificationChannel('school', 'School updates',
      description: 'Attendance, homework, fees, notices and messages from school', importance: Importance.high);

  Future<void> _start() async {
    if (_started || kIsWeb) return;
    _started = true;
    try {
      // Android finds its config in the build; iOS gets it from the cloud build's settings (firebase_ios.dart).
      final ios = Platform.isIOS ? iosFirebaseOptions() : null;
      if (Platform.isIOS && ios == null) throw StateError('no FIREBASE_IOS_APP_ID in this build');
      await Firebase.initializeApp(options: ios);
    } catch (e) {
      debugPrint('Push notifications off (no Firebase config in this build): $e');
      return;
    }
    _available = true;
    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_notification'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ),
      onDidReceiveNotificationResponse: (r) => _open(r.payload),
    );
    await _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(_channel);

    FirebaseMessaging.onMessage.listen(_showWhileOpen);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data['link'] as String?));
    FirebaseMessaging.instance.onTokenRefresh.listen((t) {
      _token = t;
      _register();
    });
    _pendingLink = (await FirebaseMessaging.instance.getInitialMessage())?.data['link'] as String?;
  }

  /// Someone signed in on this phone: ask permission (Android 13+, iOS) and send the API this phone's token.
  Future<void> signedIn() async {
    await _start();
    if (!_available) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      _token = await FirebaseMessaging.instance.getToken();
      await _register();
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
    final link = _pendingLink;
    _pendingLink = null;
    if (link != null) Timer(const Duration(milliseconds: 600), () => _open(link)); // after the home screen is up
  }

  Future<void> _register() async {
    final token = _token;
    if (token == null) return;
    try {
      await _ref.read(apiClientProvider).post<Object?>('/notifications/devices', body: {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'app': _ref.read(appConfigProvider).flavor.name,
      });
    } catch (e) {
      debugPrint('Could not register this phone for push: $e');
    }
  }

  /// Before signing out (while still signed in): this phone stops getting this person's notifications.
  Future<void> signingOut() async {
    final token = _token;
    if (!_available || token == null) return;
    try {
      await _ref.read(apiClientProvider).post<Object?>('/notifications/devices/remove', body: {'token': token});
    } catch (_) {}
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
    _token = null;
  }

  /// Android doesn't show a push while the app is open, so show it ourselves (and refresh the bell).
  void _showWhileOpen(RemoteMessage m) {
    _ref.invalidate(unreadNotificationsProvider);
    _ref.invalidate(notificationsProvider);
    final n = m.notification;
    if (n == null) return;
    _local.show(
      id: m.messageId?.hashCode ?? DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(_channel.id, _channel.name,
            channelDescription: _channel.description, importance: Importance.high, priority: Priority.high, icon: 'ic_notification'),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: m.data['link'] as String?,
    );
  }

  /// Opens the screen a notification is about (the notifications list when there isn't one in the app).
  void _open(String? link) {
    final route = appRouteFor(link) ?? '/notifications';
    final router = _ref.read(routerProvider);
    // Tabs are switched with go; full-screen pages are pushed on top (as when tapping it in the notifications list).
    if (const {'/homework', '/attendance', '/fees'}.contains(route)) {
      router.go(route);
    } else {
      router.push(route);
    }
  }
}
