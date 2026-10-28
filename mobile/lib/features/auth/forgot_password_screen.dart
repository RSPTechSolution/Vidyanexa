import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/form_widgets.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).requestPasswordReset(_email.text, null);
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: _sent
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.mark_email_read_outlined, size: 48, color: theme.extension<StatusColors>()!.success),
                  const SizedBox(height: 16),
                  Text('Check your email', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(
                    "If an account matches those details, we've sent a link to reset the password. It expires in 30 minutes.",
                    style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ])
              : Form(
                  key: _form,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text("Enter the email you sign in with and we'll send you a reset link.",
                        style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 20),
                    if (_error != null) ...[FormBanner(message: _error!), const SizedBox(height: 16)],
                    TextFormField(
                      controller: _email,
                      decoration: const InputDecoration(labelText: 'Email'),
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      onFieldSubmitted: (_) => _submit(),
                      validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                    ),
                    const SizedBox(height: 24),
                    LoadingButton(label: 'Send reset link', loading: _busy, onPressed: _submit),
                  ]),
                ),
        ),
      ),
    );
  }
}
