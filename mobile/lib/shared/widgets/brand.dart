import 'package:flutter/material.dart';


/// The Vidyanexa crest: navy on light surfaces, ivory on dark ones (or on navy when [onDark] is set).
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56, this.onDark});
  final double size;
  final bool? onDark;

  @override
  Widget build(BuildContext context) {
    final dark = onDark ?? Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      width: size,
      height: size * 1.12,
      child: Image.asset(dark ? 'assets/brand/crest-reverse.png' : 'assets/brand/crest.png', semanticLabel: 'Vidyanexa', fit: BoxFit.contain),
    );
  }
}

/// The name in widely spaced capitals in the app font (sample A). One word, one colour: never set "NEXA" apart.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.fontSize = 26, this.suffix});
  final double fontSize;
  final String? suffix;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.headlineSmall!
        .copyWith(fontSize: fontSize * 0.78, fontWeight: FontWeight.w800, letterSpacing: fontSize * 0.1);
    final tag = base.copyWith(fontFamily: Theme.of(context).textTheme.bodyMedium?.fontFamily, fontSize: fontSize * 0.5, letterSpacing: 0, fontWeight: FontWeight.w500,
        color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Semantics(
      label: suffix == null ? 'Vidyanexa' : 'Vidyanexa $suffix',
      excludeSemantics: true,
      child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
        Text('VIDYANEXA', style: base),
        if (suffix != null) ...[
          const SizedBox(width: 6),
          Text(suffix!, style: tag),
        ],
      ]),
    );
  }
}
