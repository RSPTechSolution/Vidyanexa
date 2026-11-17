import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/config/app_config.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand.dart';
import '../../shared/widgets/common.dart' show segmentLabel;
import '../../shared/widgets/hero_banner.dart';
import '../../shared/widgets/form_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  /// The parent app is also the students' app: this only changes the picture and the words, not how sign-in works.
  /// Remembered on the phone, so a student's phone keeps showing the student picture.
  bool _student = false;
  static const _studentKey = 'login.student';

  @override
  void initState() {
    super.initState();
    _loadStudent();
  }

  Future<void> _loadStudent() async {
    try {
      final saved = await SharedPreferencesAsync().getBool(_studentKey);
      if (mounted && saved != null && saved != _student) setState(() => _student = saved);
    } catch (_) {} // no saved choice: the parent picture
  }

  void _setStudent(bool v) {
    setState(() => _student = v);
    try {
      SharedPreferencesAsync().setBool(_studentKey, v).catchError((_) {});
    } catch (_) {} // storage unavailable: forgotten next time
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).signIn(
            email: _email.text,
            password: _password.text,
          );
      TextInput.finishAutofillContext();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final flavor = ref.watch(appConfigProvider).flavor;
    final auth = ref.watch(authControllerProvider).value;
    final notice = _error == null && auth is SignedOut ? auth.notice : null;
    final theme = Theme.of(context);
    final art = flavor == AppFlavor.parent && _student ? HeroArt.student : HeroArt.forFlavor(flavor);
    final (title, subtitle) = _words(art);
    final top = MediaQuery.paddingOf(context).top;
    final scheme = theme.colorScheme;

    // Theme 4: the blue banner (crest, which app, the greeting and this app's picture), then the form on a white card.
    return Scaffold(
      body: Stack(
        children: [
          Positioned(top: 0, left: 0, right: 0, height: 520, child: AppTheme.pageLight(scheme)),
          Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(16, top + 14, 16, 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _SignInBanner(flavor: flavor, art: art, title: title, subtitle: subtitle, scheme: scheme),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 20, 18, 10),
                child: AutofillGroup(
                  child: Form(
                    key: _form,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (flavor == AppFlavor.parent) ...[
                        SegmentedButton<bool>(
                          segments: [
                            ButtonSegment(value: false, label: segmentLabel("I'm a parent")),
                            ButtonSegment(value: true, label: segmentLabel("I'm a student")),
                          ],
                          selected: {_student},
                          showSelectedIcon: false,
                          // The chosen one in the theme's blue, like the tab bar.
                          style: SegmentedButton.styleFrom(
                            selectedBackgroundColor: theme.brightness == Brightness.dark ? const Color(0xFFF4F1EB) : const Color(0xFF1E2033),
                            selectedForegroundColor: theme.brightness == Brightness.dark ? const Color(0xFF1E2033) : Colors.white,
                            side: BorderSide(color: scheme.outlineVariant),
                          ),
                          onSelectionChanged: (v) => _setStudent(v.first),
                        ),
                        const SizedBox(height: 18),
                      ],
                      if (notice != null) ...[FormBanner(message: notice, tone: BannerTone.warning), const SizedBox(height: 16)],
                      TextFormField(
                        controller: _email,
                        decoration: const InputDecoration(labelText: 'Email'),
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.username, AutofillHints.email],
                        validator: (v) {
                          final s = v?.trim() ?? '';
                          if (s.isEmpty) return 'Enter your email';
                          if (!s.contains('@') || !s.contains('.')) return 'Enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      PasswordField(
                        controller: _password,
                        label: 'Password',
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _submit(),
                        validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(onPressed: () => context.push('/forgot-password'), child: const Text('Forgot password?')),
                      ),
                      const SizedBox(height: 8),
                      // Right above the button, so it's on screen when someone has scrolled down past the picture to sign in.
                      if (_error != null) ...[FormBanner(message: _error!), const SizedBox(height: 12)],
                      LoadingButton(label: 'Sign in', loading: _busy, onPressed: _submit),
                      const SizedBox(height: 12),
                      TextButton(onPressed: () => context.push('/login-code'), child: const Text('Use a one-time code instead')),
                    ]),
                  ),
                ),
              ),
              ),
              const SizedBox(height: 12),
              const AppVersion(),
            ]),
          ),
        ),
      ),
        ],
      ),
    );
  }

  static (String, String) _words(HeroArt art) => switch (art) {
    HeroArt.parent => ('Every school day, in your hand', 'Attendance, homework, fees and notices for your child.'),
    HeroArt.student => ("Ready for today's lessons?", 'Your timetable, homework and results in one place.'),
    HeroArt.staff => ('Your classes, ready when you are', 'For teachers, the office, accounts and security.'),
    HeroArt.driver => ('Every child home safe', 'Your route, your stops and who is on board.'),
  };
}

/// The top of the sign-in screen (theme 4): the blue banner with the crest, which app this is, the greeting, and this
/// app's picture (a parent and child, a student, the classroom or the bus) framed in the corner.
class _SignInBanner extends StatelessWidget {
  const _SignInBanner({required this.flavor, required this.art, required this.title, required this.subtitle, required this.scheme});
  final AppFlavor flavor;
  final HeroArt art;
  final String title;
  final String subtitle;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final deco = AppTheme.heroDecoration(scheme, radius: 28);
    return DecoratedBox(
      decoration: deco,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Stack(
          children: [
            Positioned.fill(child: AppTheme.heroLights()),
            Positioned(
              right: -30,
              bottom: -40,
              child: ExcludeSemantics(child: Opacity(opacity: 0.1, child: SvgPicture.asset('assets/hero/school-lines.svg', width: 210))),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Row(children: [
                          const BrandMark(size: 34, onDark: true),
                          const SizedBox(width: 10),
                          Flexible(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              const Text('VIDYANEXA', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: 2.4, color: Colors.white, height: 1.1)),
                              const SizedBox(height: 3),
                              Text(
                                flavor.suffix ?? 'Parents and students',
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: Color(0xE6FFFFFF)),
                              ),
                            ]),
                          ),
                        ]),
                      ),
                      // This app's picture, in a frame with a soft ring (it changes with "I'm a student").
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 2),
                          boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 18, spreadRadius: -8, offset: Offset(0, 8))],
                        ),
                        child: SizedBox(width: 112, height: 112, child: HeroBanner(art: art, height: 112, radius: 22)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(title, style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w800, letterSpacing: -0.7, height: 1.15, color: Colors.white)),
                  const SizedBox(height: 6),
                  Text(subtitle, style: const TextStyle(fontSize: 14.5, height: 1.4, color: Color(0xF2FFFFFF))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Version 1.0.0 (1)": what support asks for first.
class AppVersion extends StatefulWidget {
  const AppVersion({super.key});

  @override
  State<AppVersion> createState() => _AppVersionState();
}

class _AppVersionState extends State<AppVersion> {
  final _info = PackageInfo.fromPlatform();

  @override
  Widget build(BuildContext context) => FutureBuilder<PackageInfo>(
    future: _info,
    builder: (context, snap) {
      final info = snap.data;
      if (info == null) return const SizedBox(height: 16);
      return Text(
        'Version ${info.version} (${info.buildNumber})',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      );
    },
  );
}
