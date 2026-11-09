import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'skeleton.dart';

export 'skeleton.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Whole rupees in Indian grouping: ₹1,79,990
String inr(num v) => _inr.format(v);

StatusColors statusColors(BuildContext context) => Theme.of(context).extension<StatusColors>() ?? StatusColors.light;

/// Loading, error (with retry) and data states for an [AsyncValue].
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.builder, this.onRetry, this.loading});

  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;
  final Widget? loading;

  @override
  Widget build(BuildContext context) {
    return value.when(
      skipLoadingOnRefresh: true,
      // Loading more of a list (or any reload) keeps what's on screen instead of flashing back to a skeleton.
      skipLoadingOnReload: true,
      data: builder,
      loading: () => loading ?? const SkeletonList(),
      error: (e, _) => ErrorPanel(message: e is ApiException ? e.message : 'Something went wrong.', onRetry: onRetry),
    );
  }
}

class ErrorPanel extends StatelessWidget {
  const ErrorPanel({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 48, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

class EmptyPanel extends StatelessWidget {
  const EmptyPanel({super.key, required this.icon, required this.title, this.message});
  final IconData icon;
  final String title;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: scheme.primary.withValues(alpha: 0.1), shape: BoxShape.circle),
            child: Icon(icon, size: 34, color: scheme.primary),
          ),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

/// Horizontal chips to pick one child (parents with more than one).
class ChildSwitcher extends StatelessWidget {
  const ChildSwitcher({super.key, required this.names, required this.subtitles, required this.index, required this.onChanged});
  final List<String> names;
  final List<String> subtitles;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    if (names.length < 2) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      // Taller with a bigger phone font, so the second line ("Paid up", "₹3,000 due") is never cut off.
      height: MediaQuery.textScalerOf(context).scale(60).clamp(60, 120),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: names.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final on = i == index;
          return Semantics(
            selected: on,
            button: true,
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => onChanged(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: on ? scheme.primary.withValues(alpha: 0.12) : scheme.surface,
                  border: Border.all(color: on ? scheme.primary : scheme.outline),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(names[i], style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(subtitles[i], style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// A small coloured label; colour always comes with text.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, required this.color, this.icon});
  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 12, color: color), const SizedBox(width: 3)],
        Text(
          label,
          style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ],
    ),
  );
}

/// Percentage with a plain-language threshold.
class PercentPill extends StatelessWidget {
  const PercentPill(this.value, {super.key});
  final double? value;

  @override
  Widget build(BuildContext context) {
    final s = statusColors(context);
    if (value == null) return Text('—', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant));
    final v = value!;
    final color = v < 75
        ? s.danger
        : v < 85
        ? s.warning
        : s.success;
    return Pill(v < 75 ? '${_pct(v)} · low' : _pct(v), color: color);
  }
}

String _pct(double v) => '${v == v.roundToDouble() ? v.toInt() : v}%';
String pct(double? v) => v == null ? '—' : _pct(v);

/// An animated ring filling to [value] percent.
class PercentRing extends StatelessWidget {
  const PercentRing({super.key, required this.value, this.size = 120, this.label = 'this year'});
  final double? value;
  final double size;
  final String label;

  @override
  Widget build(BuildContext context) {
    final s = statusColors(context);
    final v = value ?? 0;
    final color = value == null
        ? Colors.grey
        : v < 75
        ? s.danger
        : v < 85
        ? s.warning
        : s.success;
    return Semantics(
      label: value == null ? 'No attendance yet' : '${pct(value)} attendance $label',
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: v / 100),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (context, t, _) => SizedBox(
          width: size,
          height: size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox.expand(
                child: CircularProgressIndicator(
                  value: t,
                  strokeWidth: size / 11,
                  strokeCap: StrokeCap.round,
                  color: color,
                  backgroundColor: color.withValues(alpha: 0.12),
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    value == null ? '—' : '${(t * 100).toStringAsFixed(t * 100 == (t * 100).roundToDouble() ? 0 : 1)}%',
                    style: TextStyle(fontSize: size / 5, fontWeight: FontWeight.w800),
                  ),
                  if (size >= 80) Text(label, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A short message at the bottom, with a matching buzz: a light tap when something worked, a firm one for an error.
void showSnack(BuildContext context, String message, {bool error = false}) {
  error ? HapticFeedback.heavyImpact() : HapticFeedback.lightImpact();
  final scheme = Theme.of(context).colorScheme;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating, backgroundColor: error ? scheme.error : null));
}

/// A label for a segment of a [SegmentedButton]: on one line, shrunk to fit rather than broken mid-word ("Mo / n")
/// when the phone's font is big and the segments are narrow.
Widget segmentLabel(String text) => FittedBox(fit: BoxFit.scaleDown, child: Text(text, maxLines: 1, softWrap: false));
