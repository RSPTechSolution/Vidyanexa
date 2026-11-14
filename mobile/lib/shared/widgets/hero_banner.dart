import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/app_theme.dart';

/// The picture at the top of sign-in and Home, one for each kind of person: a parent and child walking to school, a
/// student at the school gate, a sunny classroom, the school bus on the road.
enum HeroArt {
  parent,
  student,
  staff,
  driver;

  String get asset => 'assets/hero/$name.svg';

  /// The picture for a signed-in person: their role first, then the app they are using.
  static HeroArt forRole(String role, AppFlavor flavor) => switch (role) {
    'parent' => HeroArt.parent,
    'student' => HeroArt.student,
    'driver' => HeroArt.driver,
    _ => forFlavor(flavor),
  };

  static HeroArt forFlavor(AppFlavor flavor) => switch (flavor) {
    AppFlavor.parent => HeroArt.parent,
    AppFlavor.staff => HeroArt.staff,
    AppFlavor.driver => HeroArt.driver,
  };
}

/// [art] in a rounded card, cropped to fill it, with an optional [chip] of today's news in its lower left corner.
class HeroBanner extends StatelessWidget {
  const HeroBanner({super.key, required this.art, this.height = 186, this.radius = 24, this.chip, this.child});
  final HeroArt art;
  final double height;
  final double radius;
  final String? chip;

  /// Anything else to lay over the picture, such as the crest on the sign-in screen.
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Stack(
          fit: StackFit.expand,
          children: [
            ExcludeSemantics(child: SvgPicture.asset(art.asset, fit: BoxFit.cover)),
            if (chip != null)
              Positioned(
                left: 12,
                bottom: 12,
                right: 12,
                child: Align(alignment: Alignment.centerLeft, child: HeroChip(chip!)),
              ),
            ?child,
          ],
        ),
      ),
    );
  }
}

/// A white pill on the picture: always navy on white, whatever the app's theme, because the picture is always light.
class HeroChip extends StatelessWidget {
  const HeroChip(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    // Solid white: see-through, the drawing's shapes showed faintly behind the words.
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
    child: Text(
      text,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Brand.navy, fontWeight: FontWeight.w600),
    ),
  );
}

/// Greetings and screen headings: the app font (Plus Jakarta Sans) at extra-bold with tight spacing, ink navy on light
/// screens and the normal text colour on dark ones. Kept under its old name so every caller picks up the change.
TextStyle serifHeading(BuildContext context, {double size = 30}) {
  final theme = Theme.of(context);
  return TextStyle(
    fontWeight: FontWeight.w800,
    fontSize: size,
    height: 1.15,
    letterSpacing: -size * 0.025,
    color: theme.brightness == Brightness.dark ? theme.colorScheme.onSurface : Brand.ink,
  );
}

/// The small line above a greeting ("Parent · Green Valley Public School"), in a quiet grey.
TextStyle eyebrow(BuildContext context) {
  return TextStyle(
    fontSize: 13.5,
    fontWeight: FontWeight.w500,
    color: Theme.of(context).colorScheme.onSurfaceVariant,
  );
}
