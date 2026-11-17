import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../../features/notifications/notifications_screen.dart' show NotificationStyle, notificationIcon;

/// The picture on a push shown while the app is open (style 2, "School first"): the school's logo in a circle, or its
/// initials on its colour, with a small badge in the kind's colours (fees green, absence red...) at the bottom right.
/// Returned as PNG bytes for flutter_local_notifications.
Future<Uint8List> schoolPushPicture({
  required String kind,
  required String schoolName,
  required Color schoolColor,
  String? logoUrl,
  double size = 192,
}) async {
  final logo = logoUrl == null ? null : await _download(logoUrl);
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  final r = size / 2;
  final centre = Offset(r, r);
  final circle = Rect.fromCircle(center: centre, radius: r * 0.92);

  if (logo != null) {
    // The logo on white, fitted inside the circle.
    c.drawCircle(centre, circle.width / 2, Paint()..color = const Color(0xFFFFFFFF));
    c.save();
    c.clipPath(Path()..addOval(circle));
    final box = circle.deflate(circle.width * 0.14);
    final fit = applyBoxFit(BoxFit.contain, Size(logo.width.toDouble(), logo.height.toDouble()), box.size);
    final dst = Alignment.center.inscribe(fit.destination, box);
    c.drawImageRect(logo, Offset.zero & Size(logo.width.toDouble(), logo.height.toDouble()), dst, Paint()..filterQuality = FilterQuality.high);
    c.restore();
  } else {
    c.drawCircle(centre, circle.width / 2, Paint()..color = schoolColor);
    _text(c, schoolInitials(schoolName), centre, size * 0.3, const Color(0xFFFFFFFF), fontFamily: 'Plus Jakarta Sans', weight: FontWeight.w800);
  }

  // The kind's badge: a small gradient circle with a white ring and the kind's icon.
  final style = NotificationStyle.of(kind);
  final bc = Offset(size * 0.8, size * 0.8);
  final br = size * 0.2;
  c.drawCircle(bc, br + size * 0.03, Paint()..color = const Color(0xFFFFFFFF));
  c.drawCircle(
    bc,
    br,
    Paint()..shader = ui.Gradient.linear(bc - Offset(br, br), bc + Offset(br, br), [style.from, style.to]),
  );
  final icon = notificationIcon(kind);
  _text(c, String.fromCharCode(icon.codePoint), bc, br * 1.15, const Color(0xFFFFFFFF), fontFamily: icon.fontFamily, package: icon.fontPackage);

  final img = await rec.endRecording().toImage(size.round(), size.round());
  final png = await img.toByteData(format: ui.ImageByteFormat.png);
  return png!.buffer.asUint8List();
}

/// A school's initials, as on its emails: the first letters of up to two words, skipping "of", "the" and "and".
String schoolInitials(String name) {
  final words = name.split(RegExp(r'\s+')).where((w) => w.isNotEmpty && RegExp(r'[A-Za-z0-9]').hasMatch(w[0]) && !{'of', 'the', 'and', '&'}.contains(w.toLowerCase()));
  final s = words.take(2).map((w) => w[0].toUpperCase()).join();
  return s.isEmpty ? 'S' : s;
}

/// "#1F6B4F" as a Color; the email navy when it can't be read.
Color schoolColorFrom(String? hex) {
  final h = (hex ?? '').replaceFirst('#', '');
  final v = h.length == 6 ? int.tryParse(h, radix: 16) : null;
  return Color(0xFF000000 | (v ?? 0x15233F));
}

void _text(Canvas c, String text, Offset centre, double fontSize, Color color, {String? fontFamily, String? package, FontWeight? weight}) {
  final tp = TextPainter(
    text: TextSpan(text: text, style: TextStyle(fontSize: fontSize, color: color, fontFamily: fontFamily, package: package, fontWeight: weight, height: 1)),
    textDirection: TextDirection.ltr,
  )..layout();
  tp.paint(c, centre - Offset(tp.width / 2, tp.height / 2));
}

/// The school's logo, or null when it can't be fetched quickly (the initials are used instead).
Future<ui.Image?> _download(String url) async {
  try {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 3);
    final res = await (await client.getUrl(Uri.parse(url))).close().timeout(const Duration(seconds: 4));
    if (res.statusCode != 200) return null;
    final bytes = await res.fold<List<int>>([], (a, b) => a..addAll(b)).timeout(const Duration(seconds: 4));
    client.close();
    final codec = await ui.instantiateImageCodec(Uint8List.fromList(bytes), targetWidth: 256);
    return (await codec.getNextFrame()).image;
  } catch (_) {
    return null;
  }
}
