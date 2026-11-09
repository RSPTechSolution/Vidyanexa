import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    final heroHeight = (MediaQuery.sizeOf(context).height * 0.42).clamp(220.0, 380.0);

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(12, top + 12, 12, 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              HeroBanner(
                art: art,
                height: heroHeight,
                radius: 28,
                child: Positioned(top: 16, left: 16, child: _CrestPill(flavor: flavor)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 22, 12, 0),
                child: AutofillGroup(
                  child: Form(
                    key: _form,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text(title, style: serifHeading(context, size: 32)),
                      const SizedBox(height: 4),
                      Text(subtitle, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                      const SizedBox(height: 18),
                      if (flavor == AppFlavor.parent) ...[
                        SegmentedButton<bool>(
                          segments: [
                            ButtonSegment(value: false, label: segmentLabel("I'm a parent")),
                            ButtonSegment(value: true, label: segmentLabel("I'm a student")),
                          ],
                          selected: {_student},
                          showSelectedIcon: false,
                          // The crest's gold for the chosen one, like the tab bar.
                          style: SegmentedButton.styleFrom(
                            selectedBackgroundColor: theme.brightness == Brightness.dark ? const Color(0xFF5A4520) : const Color(0xFFFCE9B8),
                            selectedForegroundColor: theme.brightness == Brightness.dark ? const Color(0xFFF6DFA6) : Brand.navy,
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
                      const SizedBox(height: 8),
                      const AppVersion(),
                    ]),
                  ),
                ),
              ),
            ]),
          ),
        ),
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

/// The crest and name on a white pill in the corner of the picture.
class _CrestPill extends StatelessWidget {
  const _CrestPill({required this.flavor});
  final AppFlavor flavor;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(8, 6, 14, 6),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.94), borderRadius: BorderRadius.circular(999)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      const BrandMark(size: 30, onDark: false),
      const SizedBox(width: 8),
      Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        const Text('VIDYANEXA', style: TextStyle(fontFamily: 'Cinzel', fontWeight: FontWeight.w600, fontSize: 15, letterSpacing: 2, color: Brand.navy, height: 1.1)),
        Text(
          flavor.suffix ?? 'Parents and students',
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.8, color: Color(0xFF8A6420)),
        ),
      ]),
    ]),
  );
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
