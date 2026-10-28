import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/brand.dart';
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

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Form(
                  key: _form,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Center(child: BrandMark(size: 64)),
                    const SizedBox(height: 14),
                    Center(child: Wordmark(suffix: flavor.suffix)),
                    const SizedBox(height: 6),
                    Center(child: Text(flavor.tagline, style: TextStyle(color: theme.colorScheme.onSurfaceVariant))),
                    const SizedBox(height: 36),
                    Text('Sign in', style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 20),
                    if (_error != null) ...[FormBanner(message: _error!), const SizedBox(height: 16)],
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
                    LoadingButton(label: 'Sign in', loading: _busy, onPressed: _submit),
                    const SizedBox(height: 12),
                    TextButton(onPressed: () => context.push('/login-code'), child: const Text('Use a one-time code instead')),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
