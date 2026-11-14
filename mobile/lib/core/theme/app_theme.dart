import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

/// Theme version 3 ("Ink & gold", approved sample A): Material 3 roles from the crest's ink navy, gold kept for the
/// one main action on a screen. Plus Jakarta Sans throughout.
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
  primary: Color(0xFF13284A),
  onPrimary: Color(0xFFFFFFFF),
  primaryContainer: Color(0xFFDCE3F0),
  onPrimaryContainer: Color(0xFF0B1B33),
  secondary: Color(0xFF575E71),
  onSecondary: Color(0xFFFFFFFF),
  secondaryContainer: Color(0xFFDCE2F9),
  onSecondaryContainer: Color(0xFF141B2C),
  tertiary: Color(0xFF785A00),
  onTertiary: Color(0xFFFFFFFF),
  tertiaryContainer: Color(0xFFFFDEA6),
  onTertiaryContainer: Color(0xFF261900),
  error: Color(0xFFBA1A1A),
  onError: Color(0xFFFFFFFF),
  errorContainer: Color(0xFFFFDAD6),
  onErrorContainer: Color(0xFF410002),
  surface: Color(0xFFF4F5F7), // cool light grey, so white cards stand out (sample A)
  onSurface: Color(0xFF101828),
  onSurfaceVariant: Color(0xFF555F70),
  outline: Color(0xFF7A8394),
  outlineVariant: Color(0xFFE2E5EA),
  surfaceContainerLowest: Color(0xFFFFFFFF),
  surfaceContainerLow: Color(0xFFF7F8FA),
  surfaceContainer: Color(0xFFEEF0F3),
  surfaceContainerHigh: Color(0xFFE8EBEF),
  surfaceContainerHighest: Color(0xFFE2E5EA),
  surfaceDim: Color(0xFFD9DCE2),
  surfaceBright: Color(0xFFF4F5F7),
  inverseSurface: Color(0xFF2F3036),
  onInverseSurface: Color(0xFFF1F0F7),
  inversePrimary: Color(0xFFB0C6FF),
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
);

const _dark = ColorScheme(
  brightness: Brightness.dark,
  primary: Color(0xFFB0C6FF),
  onPrimary: Color(0xFF172E60),
  primaryContainer: Color(0xFF2F4578),
  onPrimaryContainer: Color(0xFFD9E2FF),
  secondary: Color(0xFFC0C6DC),
  onSecondary: Color(0xFF2A3042),
  secondaryContainer: Color(0xFF3E4759),
  onSecondaryContainer: Color(0xFFDCE2F9),
  tertiary: Color(0xFFE2BE74),
  onTertiary: Color(0xFF3F2E00),
  tertiaryContainer: Color(0xFF5D4200),
  onTertiaryContainer: Color(0xFFFFDEA6),
  error: Color(0xFFFFB4AB),
  onError: Color(0xFF690005),
  errorContainer: Color(0xFF93000A),
  onErrorContainer: Color(0xFFFFDAD6),
  surface: Color(0xFF121318),
  onSurface: Color(0xFFE3E2E9),
  onSurfaceVariant: Color(0xFFC5C6D0),
  outline: Color(0xFF8F909A),
  outlineVariant: Color(0xFF45464F),
  surfaceContainerLowest: Color(0xFF0D0E13),
  surfaceContainerLow: Color(0xFF1A1B21),
  surfaceContainer: Color(0xFF1E1F25),
  surfaceContainerHigh: Color(0xFF292A2F),
  surfaceContainerHighest: Color(0xFF34343A),
  surfaceDim: Color(0xFF121318),
  surfaceBright: Color(0xFF38393F),
  inverseSurface: Color(0xFFE3E2E9),
  onInverseSurface: Color(0xFF2F3036),
  inversePrimary: Color(0xFF2F4A86),
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
);

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
    if (hex == null || hex.length != 6 || hex == '15233f' || hex == '2f4a86' || hex == '0b1b33') return null;
    final v = int.tryParse(hex, radix: 16);
    if (v == null) return null;
    return ColorScheme.fromSeed(seedColor: Color(0xFF000000 | v), brightness: b, dynamicSchemeVariant: DynamicSchemeVariant.tonalSpot);
  }

  /// A strong, solid panel that keeps white text readable in both modes (summary cards such as fees due).
  static Color heroPanel(ColorScheme s) => s.brightness == Brightness.dark ? s.primaryContainer : s.primary;

  /// The theme inside an ink panel ([inkPanel]) on any screen: the dark theme, so text, icons and status colours stay
  /// readable on the deep navy in both light and dark mode.
  static final ThemeData onInk = dark();

  /// The deep navy behind Home's summary cards (sample A); a step lighter than the page in dark mode.
  static Color inkPanel(ColorScheme s) => s.brightness == Brightness.dark ? const Color(0xFF16263F) : Brand.ink;

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
      // White cards with a hairline border on the light grey ground, no shadow (sample A); outlined in dark mode too.
      cardTheme: CardThemeData(
        color: cardColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shadowColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
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
        backgroundColor: isDark ? scheme.surfaceContainer : Colors.white,
        surfaceTintColor: Colors.transparent,
        // The selected tab sits on a soft gold pill, the crest's gold.
        indicatorColor: scheme.brightness == Brightness.light ? const Color(0xFFF6E9C9) : const Color(0xFF5A4520),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(color: states.contains(WidgetState.selected) ? (isDark ? scheme.onSurface : Brand.ink) : scheme.onSurfaceVariant),
        ),
        // Small enough that five labels ("Attendance", "Homework") fit side by side on a phone.
        labelTextStyle: WidgetStatePropertyAll(textTheme.labelMedium?.copyWith(fontSize: 11, letterSpacing: -0.1, fontWeight: FontWeight.w600)),
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
