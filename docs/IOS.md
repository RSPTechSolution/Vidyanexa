# iPhone apps: from Apple account to TestFlight links

The three apps (Vidyanexa, Vidyanexa Staff, Vidyanexa Driver) are built in the cloud by Codemagic, because iPhone apps
can only be built on a Mac. The code side is ready (`codemagic.yaml`, `mobile/ios`). These steps are done once, by you,
in your Apple, Firebase and Codemagic accounts. Steps 1, 2 and 6 take waiting time; the rest are a few minutes each.

App IDs used everywhere below: `com.vidyanexa.parent`, `com.vidyanexa.staff`, `com.vidyanexa.driver`.

## 1. Apple Developer account ($99 a year)

Enroll at developer.apple.com/programs/enroll with the Apple ID you want to own the apps.

- **As an organisation** (shows "Vidyanexa" or your company as the seller): needs a D-U-N-S number for the company
  (free from Dun & Bradstreet, can take up to two weeks) and a company website.
- **As an individual** (shows your own name as the seller): approved in a day or two.

## 2. Register the three app IDs, with push

developer.apple.com → Account → Certificates, Identifiers & Profiles → **Identifiers** → **+** → App IDs → App.
Do this three times:

| Description | Bundle ID (Explicit) |
|---|---|
| Vidyanexa | `com.vidyanexa.parent` |
| Vidyanexa Staff | `com.vidyanexa.staff` |
| Vidyanexa Driver | `com.vidyanexa.driver` |

In each, tick **Push Notifications** under Capabilities, then Continue → Register.

## 3. The push key (one key for all three apps)

Same page → **Keys** → **+** → name it "Vidyanexa push" → tick **Apple Push Notifications service (APNs)** →
Continue → Register → **Download** the `.p8` file (it can be downloaded only once; keep it safe). Note the **Key ID**,
and your **Team ID** (top right of the page).

## 4. The three apps in App Store Connect

appstoreconnect.apple.com → **Apps** → **+** → **New App**, three times: platform iOS, the name from the table
above, language English (U.K.) or English (India), the matching bundle ID from the list, SKU e.g. `vidyanexa-parent`,
access Full.

## 5. Firebase: add the iOS apps and the push key

console.firebase.google.com → project **vidyanexa-de260** → Project settings (gear icon):

1. **General** → Your apps → **Add app** → iOS, three times, with the three bundle IDs. Skip the download and code
   steps of the wizard.
2. Open each iOS app there and note its **App ID** (looks like `1:963882941296:ios:…`). The **Web API key** at the top
   of the General tab is the API key. These are not secret; send them to me or put them straight into Codemagic (step 7).
3. **Cloud Messaging** tab → Apple app configuration → for each of the three iOS apps → APNs Authentication Key →
   **Upload** the `.p8` file from step 3 with its Key ID and Team ID.

## 6. App Store Connect API key (lets Codemagic sign and upload)

appstoreconnect.apple.com → **Users and Access** → **Integrations** → App Store Connect API → **Team Keys** → **+** →
name "Codemagic", access **App Manager** → Generate → **Download** the `.p8` (once only). Note the **Issuer ID** and
the **Key ID**.

## 7. Codemagic

1. Sign up at codemagic.io with the GitHub account that has the Vidyanexa repository, and add the repository.
   The free plan includes 500 Mac build minutes a month; one build of all three apps takes about 30–45 minutes.
2. **Team settings → Integrations → Developer Portal** → Connect → name it exactly `Vidyanexa` → Issuer ID, Key ID and
   the `.p8` file from step 6.
3. Make the certificate key, on this computer in Git Bash (keep the file safe, out of the repository):
   ```
   ssh-keygen -t rsa -b 2048 -m PEM -f vidyanexa_cert_key -q -N ""
   ```
4. The app in Codemagic → **Environment variables**, all in a group named `ios`:

   | Name | Value | Secret |
   |---|---|---|
   | `CERTIFICATE_PRIVATE_KEY` | the whole content of the file `vidyanexa_cert_key` | yes |
   | `FIREBASE_IOS_API_KEY` | the Web API key from step 5 | no |
   | `FIREBASE_IOS_APP_ID_PARENT` | App ID of the iOS app `com.vidyanexa.parent` | no |
   | `FIREBASE_IOS_APP_ID_STAFF` | … `com.vidyanexa.staff` | no |
   | `FIREBASE_IOS_APP_ID_DRIVER` | … `com.vidyanexa.driver` | no |

5. **Start new build** → workflow **iPhone apps to TestFlight** → branch `master`.

## 8. TestFlight links

About 15 minutes after the build finishes, each app shows the build under **TestFlight** in App Store Connect.

- **Your own team** (people you add under Users and Access, up to 100): TestFlight → Internal Testing → **+** → add
  them. No review; they get an email and install from the TestFlight app.
- **Anyone with a link** (parents, teachers, drivers): TestFlight → External Testing → **+** → group "Public" → add
  the build → fill in "What to test", a contact email, and a demo sign-in for Apple's reviewer
  (`parent@demo.com` / `Demo@1234`, `teacher@demo.com`, `driver@demo.com`) → **Submit for Review**. The first build of
  each app is reviewed by Apple, usually within a day. Then **Enable Public Link** and copy it: it looks like
  `https://testflight.apple.com/join/AbCd1234`. People install Apple's **TestFlight** app and open the link.

TestFlight builds expire after 90 days; new builds from Codemagic replace them. When you are ready for the App Store,
the same builds can be submitted from the app's App Store tab.
