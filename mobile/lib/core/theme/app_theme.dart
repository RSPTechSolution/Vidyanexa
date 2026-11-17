import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

/// Theme version 5 ("Pastel bento", approved sample): a warm off-white page (near-black in dark mode) with soft peach
/// and blue light, Home's day as soft-coloured tiles ([PastelTone]), colourful shortcut tiles, a coral gradient for the
/// one thing to do first ([AppTheme.heroDecoration]), an ink pill on the floating tab bar. Light and dark.
/// Earlier: git tags theme-v4-app ("Polished"), theme-v3 ("Ink & gold").
class Brand {
  static const navy = Color(0xFF15233F); // the crest's Ink Navy
  static const gold = Color(0xFFB8893C); // the crest's Antique Gold
  static const ink = Color(0xFF0B1B33); // the deep panel behind Home's summary cards
  static const goldButton = Color(0xFFC9A04E); // gold fill for a screen's main action, with [onGold] text
  static const onGold = Color(0xFF1B1406);

  static const success = Color(0xFF006D3D);
  static const successDark = Color(0xFF7DDB9F);
  static const warning = Color(0xFF8B5000);
  static const warningDark = Color(0xFFFFB95C);
  static const info = Color(0xFF00629E);
  static const infoDark = Color(0xFF9ACBFF);
  static const danger = Color(0xFFBA1A1A);
  static const dangerDark = Color(0xFFFFB4AB);
}

/// The app's typeface, bundled in pubspec.yaml (Regular to ExtraBold) so every weight is the real cut and works offline.
const appFont = 'Plus Jakarta Sans';

/// The single place the app's typeface is chosen. Change [appFont] to change it everywhere.
TextTheme _fontTheme(TextTheme base) {
  final t = base.apply(fontFamily: appFont);
  // Material's default letter spacing (up to 0.5) is tuned for Roboto; this face reads best set normally.
  TextStyle? n(TextStyle? s) => s?.copyWith(letterSpacing: 0);
  return t.copyWith(
    bodyLarge: n(t.bodyLarge),
    bodyMedium: n(t.bodyMedium),
    bodySmall: n(t.bodySmall),
    titleMedium: n(t.titleMedium),
    titleSmall: n(t.titleSmall),
    labelLarge: n(t.labelLarge),
    labelMedium: n(t.labelMedium),
    labelSmall: n(t.labelSmall),
  );
}

const _light = ColorScheme(
  brightness: Brightness.light,
  primary: Color(0xFF3D63DD),
  onPrimary: Color(0xFFFFFFFF),
  primaryContainer: Color(0xFFE3E9FF),
  onPrimaryContainer: Color(0xFF1B2A6B),
  secondary: Color(0xFF5E5F78),
  onSecondary: Color(0xFFFFFFFF),
  secondaryContainer: Color(0xFFEDEAFF),
  onSecondaryContainer: Color(0xFF2A2350),
  tertiary: Color(0xFF9A4A1E),
  onTertiary: Color(0xFFFFFFFF),
  tertiaryContainer: Color(0xFFFFE8D6),
  onTertiaryContainer: Color(0xFF3A1A05),
  error: Color(0xFFBA1A1A),
  onError: Color(0xFFFFFFFF),
  errorContainer: Color(0xFFFFDAD6),
  onErrorContainer: Color(0xFF410002),
  surface: Color(0xFFFBFAF7), // warm off-white
  onSurface: Color(0xFF1E2033),
  onSurfaceVariant: Color(0xFF63657C),
  outline: Color(0xFF85879B),
  outlineVariant: Color(0xFFEDE9E1),
  surfaceContainerLowest: Color(0xFFFFFFFF),
  surfaceContainerLow: Color(0xFFF8F6F1),
  surfaceContainer: Color(0xFFF4F1EB),
  surfaceContainerHigh: Color(0xFFEEEAE3),
  surfaceContainerHighest: Color(0xFFE8E4DC),
  surfaceDim: Color(0xFFE2DED6),
  surfaceBright: Color(0xFFFBFAF7),
  inverseSurface: Color(0xFF2F3036),
  onInverseSurface: Color(0xFFF1F0F7),
  inversePrimary: Color(0xFFB9C8FF),
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
);

const _dark = ColorScheme(
  brightness: Brightness.dark,
  primary: Color(0xFF9DB4FF),
  onPrimary: Color(0xFF13121A),
  primaryContainer: Color(0xFF2A3157),
  onPrimaryContainer: Color(0xFFDCE3FF),
  secondary: Color(0xFFC4C2DA),
  onSecondary: Color(0xFF2A2938),
  secondaryContainer: Color(0xFF28224A),
  onSecondaryContainer: Color(0xFFD9D2FF),
  tertiary: Color(0xFFFFC9A0),
  onTertiary: Color(0xFF3A1A05),
  tertiaryContainer: Color(0xFF3B261A),
  onTertiaryContainer: Color(0xFFFFD3B5),
  error: Color(0xFFFFB4AB),
  onError: Color(0xFF690005),
  errorContainer: Color(0xFF93000A),
  onErrorContainer: Color(0xFFFFDAD6),
  surface: Color(0xFF13121A), // warm near-black
  onSurface: Color(0xFFECEAF2),
  onSurfaceVariant: Color(0xFFA3A1B5),
  outline: Color(0xFF6F6D84),
  outlineVariant: Color(0xFF2A2936),
  surfaceContainerLowest: Color(0xFF0E0D14),
  surfaceContainerLow: Color(0xFF1F1E29),
  surfaceContainer: Color(0xFF232230),
  surfaceContainerHigh: Color(0xFF2A2937),
  surfaceContainerHighest: Color(0xFF31303F),
  surfaceDim: Color(0xFF13121A),
  surfaceBright: Color(0xFF34333F),
  inverseSurface: Color(0xFFE3E2E9),
  onInverseSurface: Color(0xFF2F3036),
  inversePrimary: Color(0xFF3D63DD),
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
);

/// The soft colours of Home's tiles (theme 5): a pastel background with deep text in light mode, a deep background with
/// pastel text in dark mode, so each kind keeps its colour in both.
enum PastelTone {
  mint(Color(0xFFD9F5E6), Color(0xFF0F5E3A), Color(0xFFB4E8CD), Color(0xFF16382A), Color(0xFFBDF0D5), Color(0xFF245A42)),
  peach(Color(0xFFFFE8D6), Color(0xFF7A3A10), Color(0xFFFFC9A0), Color(0xFF3B261A), Color(0xFFFFD3B5), Color(0xFF5A3622)),
  lavender(Color(0xFFE7E3FF), Color(0xFF3B2B8F), Color(0xFFCFC6FF), Color(0xFF28224A), Color(0xFFD9D2FF), Color(0xFF3A3170)),
  sky(Color(0xFFDCEEFF), Color(0xFF164B85), Color(0xFFB9DAFF), Color(0xFF142E4A), Color(0xFFC4DEFF), Color(0xFF1E4470));

  const PastelTone(this._bg, this._fg, this._tile, this._bgDark, this._fgDark, this._tileDark);
  final Color _bg, _fg, _tile, _bgDark, _fgDark, _tileDark;

  Color bg(Brightness b) => b == Brightness.dark ? _bgDark : _bg;
  Color fg(Brightness b) => b == Brightness.dark ? _fgDark : _fg;

  /// The small rounded square behind a tile's icon.
  Color tile(Brightness b) => b == Brightness.dark ? _tileDark : _tile;
}

/// Status colours that adapt to the theme.
@immutable
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors({required this.success, required this.warning, required this.info, required this.danger});

  final Color success;
  final Color warning;
  final Color info;
  final Color danger;

  static const light = StatusColors(success: Brand.success, warning: Brand.warning, info: Brand.info, danger: Brand.danger);
  static const dark = StatusColors(success: Brand.successDark, warning: Brand.warningDark, info: Brand.infoDark, danger: Brand.dangerDark);

  @override
  StatusColors copyWith({Color? success, Color? warning, Color? info, Color? danger}) =>
      StatusColors(success: success ?? this.success, warning: warning ?? this.warning, info: info ?? this.info, danger: danger ?? this.danger);

  @override
  StatusColors lerp(StatusColors? other, double t) {
    if (other == null) return this;
    return StatusColors(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      info: Color.lerp(info, other.info, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
    );
  }
}

class AppTheme {
  static ThemeData light([String? accent]) => _build(_scheme(accent, Brightness.light) ?? _light);
  static ThemeData dark([String? accent]) => _build(_scheme(accent, Brightness.dark) ?? _dark);

  /// A school's own accent colour as a full Material 3 scheme (the same method as the web app). Navy, the default,
  /// keeps the hand-tuned scheme above.
  static ColorScheme? _scheme(String? accent, Brightness b) {
    final hex = accent?.replaceFirst('#', '').toLowerCase();
    if (hex == null || hex.length != 6 || const {'15233f', '2f4a86', '0b1b33', '13284a', '3d63dd'}.contains(hex)) return null;
    final v = int.tryParse(hex, radix: 16);
    if (v == null) return null;
    return ColorScheme.fromSeed(seedColor: Color(0xFF000000 | v), brightness: b, dynamicSchemeVariant: DynamicSchemeVariant.tonalSpot);
  }

  /// A strong, solid panel that keeps white text readable in both modes (summary cards such as fees due).
  static Color heroPanel(ColorScheme s) => s.brightness == Brightness.dark ? s.primaryContainer : s.primary;

  /// The theme inside an ink panel ([inkPanel]) on any screen: the dark theme, so text, icons and status colours stay
  /// readable on the deep navy in both light and dark mode.
  static final ThemeData onInk = dark();

  /// One solid colour for Home's summary cards (the middle of [heroDecoration]'s gradient), where a single colour is needed.
  static Color inkPanel(ColorScheme s) => s.brightness == Brightness.dark ? const Color(0xFF26407A) : const Color(0xFF2F4A86);

  /// The one thing to do first, and the big totals (theme 5): a coral gradient. White text stays readable across it.
  static BoxDecoration heroDecoration(ColorScheme s, {double radius = 26}) {
    final dark = s.brightness == Brightness.dark;
    return BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: dark ? const [Color(0xFFE8704A), Color(0xFFE04A7A)] : const [Color(0xFFF2784B), Color(0xFFEC4F82)],
      ),
      boxShadow: [BoxShadow(color: dark ? const Color(0x8C000000) : const Color(0x80FF5F8F), blurRadius: 30, spreadRadius: -16, offset: const Offset(0, 16))],
    );
  }

  /// A soft white highlight in the top corner of [heroDecoration].
  static Widget heroLights() => const IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(center: Alignment(1.1, -1.2), radius: 0.8, colors: [Color(0x38FFFFFF), Color(0x00FFFFFF)]),
          ),
        ),
      );

  /// A soft peach and blue light across the top of a screen (light and dark).
  static Widget pageLight(ColorScheme s) {
    final dark = s.brightness == Brightness.dark;
    return IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(1.0, -1.0),
            radius: 0.75,
            colors: [dark ? const Color(0x29FF9664) : const Color(0x47FFD6B4), const Color(0x00000000)],
          ),
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(-1.0, -1.0),
              radius: 0.6,
              colors: [dark ? const Color(0x247896FF) : const Color(0x40CEE2FF), const Color(0x00000000)],
            ),
          ),
        ),
      ),
    );
  }

  /// Gold fill for the one main action on a screen (Pay, Mark attendance).
  static final ButtonStyle goldButton = FilledButton.styleFrom(backgroundColor: Brand.goldButton, foregroundColor: Brand.onGold);

  static ThemeData _build(ColorScheme scheme) {
    final isDark = scheme.brightness == Brightness.dark;
    final base = _fontTheme(ThemeData(brightness: scheme.brightness).textTheme);
    final textTheme = base
        .copyWith(
          displaySmall: base.displaySmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.6),
          headlineLarge: base.headlineLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5),
          headlineMedium: base.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4),
          headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
          titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2),
          titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        )
        .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface);

    final cardColor = isDark ? scheme.surfaceContainerLow : scheme.surfaceContainerLowest;
    OutlineInputBorder field(Color c, [double w = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: c, width: w),
    );

    return ThemeData(
      useMaterial3: true,
      fontFamily: appFont,
      colorScheme: scheme,
      // A ripple from the touch point on every tap (the shimmering "sparkle" ripple where the platform supports it).
      splashFactory: kIsWeb ? InkRipple.splashFactory : InkSparkle.splashFactory,
      brightness: scheme.brightness,
      scaffoldBackgroundColor: scheme.surface,
      textTheme: textTheme,
      extensions: [isDark ? StatusColors.dark : StatusColors.light],
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 2,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(fontSize: 21, fontWeight: FontWeight.w700),
      ),
      // White cards with a hairline border and a soft warm shadow (theme 5); no shadow in dark mode.
      cardTheme: CardThemeData(
        color: cardColor,
        surfaceTintColor: Colors.transparent,
        elevation: isDark ? 0 : 1,
        shadowColor: isDark ? Colors.transparent : const Color(0x1A3C2814),
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardColor,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: field(scheme.outline),
        enabledBorder: field(scheme.outline),
        focusedBorder: field(scheme.primary, 2),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          // Dark mode: the website's solid blue with white text, rather than the pale primary (theme 4).
          backgroundColor: isDark ? const Color(0xFF4A69E2) : null,
          foregroundColor: isDark ? Colors.white : null,
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          side: BorderSide(color: scheme.outlineVariant),
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: const StadiumBorder(), textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600)),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        selectedColor: scheme.secondaryContainer,
        side: BorderSide(color: scheme.outlineVariant),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primaryContainer,
        foregroundColor: scheme.onPrimaryContainer,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        // A floating rounded bar (home_shell.dart); the selected tab is an ink pill (a cream one in dark mode).
        backgroundColor: isDark ? const Color(0xFF1F1E29) : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: isDark ? const Color(0xFFF4F1EB) : const Color(0xFF1E2033),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? (isDark ? const Color(0xFF1E2033) : Colors.white) : scheme.onSurfaceVariant,
          ),
        ),
        // Small enough that five labels ("Attendance", "Homework") fit side by side on a phone.
        labelTextStyle: WidgetStateProperty.resolveWith((states) => textTheme.labelMedium?.copyWith(
              fontSize: 11,
              letterSpacing: -0.1,
              fontWeight: FontWeight.w700,
              color: states.contains(WidgetState.selected) ? scheme.onSurface : scheme.onSurfaceVariant,
            )),
      ),
      dialogTheme: DialogThemeData(backgroundColor: scheme.surfaceContainerHigh, surfaceTintColor: Colors.transparent),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: scheme.surfaceContainerLow, surfaceTintColor: Colors.transparent),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      // Moving between screens: the new one fades in while sliding forward (iOS keeps its own native slide).
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.fuchsia: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
