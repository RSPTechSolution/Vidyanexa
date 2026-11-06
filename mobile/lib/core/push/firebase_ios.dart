import 'package:firebase_core/firebase_core.dart';

/// Firebase for the iPhone apps. Android reads `android/app/src/<flavor>/google-services.json`; on iOS the cloud build
/// passes the app's two values from its GoogleService-Info.plist (Firebase console → Project settings → Your apps →
/// the iOS app): GOOGLE_APP_ID as FIREBASE_IOS_APP_ID and API_KEY as FIREBASE_IOS_API_KEY. Neither is secret: both
/// ship inside the app. Without them the iPhone app runs with push notifications off.
const _appId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
const _apiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');

FirebaseOptions? iosFirebaseOptions() => _appId.isEmpty || _apiKey.isEmpty
    ? null
    : const FirebaseOptions(
        appId: _appId,
        apiKey: _apiKey,
        messagingSenderId: '963882941296', // project vidyanexa-de260
        projectId: 'vidyanexa-de260',
        storageBucket: 'vidyanexa-de260.firebasestorage.app',
      );
