import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Runs before every test file: the phone's secure storage is an in-memory map in tests (with nothing saved, so the
/// fingerprint lock is off and the theme follows the system).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  FlutterSecureStorage.setMockInitialValues({});
  PackageInfo.setMockInitialValues(
      appName: 'Vidyanexa', packageName: 'com.vidyanexa.parent', version: '1.2.0', buildNumber: '7', buildSignature: '');
  await testMain();
}
