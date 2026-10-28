import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/form_widgets.dart';

/// Sign in with a 6-digit code sent by email, or by SMS when a mobile number is entered.
class CodeLoginScreen extends ConsumerStatefulWidget {
  const CodeLoginScreen({super.key});

  @override
  ConsumerState<CodeLoginScreen> createState() => _CodeLoginScreenState();
}

class _CodeLoginScreenState extends ConsumerState<CodeLoginScreen> {
  final _identifier = TextEditingController();
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  int _wait = 0;
  Timer? _timer;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _timer?.cancel();
    _identifier.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _byPhone => _identifier.text.trim().isNotEmpty && !_identifier.text.contains('@');

  Future<void> _send() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).requestLoginCode(identifier: _identifier.text);
      _timer?.cancel();
      setState(() {
        _sent = true;
        _wait = 60;
        _info = _byPhone ? 'If that number has an account, a code is on its way by SMS and email.' : 'If that email has an account, a code is on its way.';
      });
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted || _wait <= 1) t.cancel();
        if (mounted) setState(() => _wait = _wait > 0 ? _wait - 1 : 0);
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).signInWithCode(identifier: _identifier.text, code: _code.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in with a code')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          if (_error != null) ...[FormBanner(message: _error!), const SizedBox(height: 16)],
          if (_info != null && _error == null) ...[FormBanner(message: _info!, tone: BannerTone.info), const SizedBox(height: 16)],
          TextField(
            controller: _identifier,
            enabled: !_sent,
            autocorrect: false,
            keyboardType: TextInputType.emailAddress,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Email or mobile number'),
          ),
          const SizedBox(height: 16),
          if (_sent) ...[
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              autofillHints: const [AutofillHints.oneTimeCode],
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Sign-in code', counterText: ''),
            ),
            const SizedBox(height: 8),
            LoadingButton(label: 'Sign in', loading: _busy, onPressed: _code.text.trim().length == 6 ? _verify : null),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              TextButton(
                onPressed: () => setState(() {
                  _sent = false;
                  _code.clear();
                  _info = null;
                }),
                child: const Text('Change details'),
              ),
              TextButton(onPressed: _wait > 0 || _busy ? null : _send, child: Text(_wait > 0 ? 'Send again in ${_wait}s' : 'Send again')),
            ]),
          ] else
            LoadingButton(label: 'Send me a code', loading: _busy, onPressed: _identifier.text.trim().length >= 3 ? _send : null),
        ]),
      ),
    );
  }
}
