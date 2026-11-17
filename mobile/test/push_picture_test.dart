import 'dart:io';

import 'package:eduvia/core/push/push_picture.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test("a school's initials skip small words", () {
    expect(schoolInitials('Green Valley Public School'), 'GV');
    expect(schoolInitials('The School of Arts'), 'SA');
    expect(schoolInitials(''), 'S');
  });

  test("the school's colour is read from its hex code, with navy when it can't be", () {
    expect(schoolColorFrom('#1F6B4F'), const Color(0xFF1F6B4F));
    expect(schoolColorFrom('nonsense'), const Color(0xFF15233F));
    expect(schoolColorFrom(null), const Color(0xFF15233F));
  });

  testWidgets("the push picture is a PNG of the school's initials with the kind's badge", (tester) async {
    final out = Platform.environment['PUSH_PICTURE_OUT'];
    if (out != null) {
      // Real fonts for looking at the picture (tests otherwise draw every letter as a box).
      for (final (family, files) in [
        ('Plus Jakarta Sans', ['assets/fonts/PlusJakartaSans-ExtraBold.ttf']),
        ('MaterialIcons', [Platform.environment['MATERIAL_ICONS_FONT'] ?? '']),
      ]) {
        final l = FontLoader(family);
        for (final f in files.where((f) => f.isNotEmpty)) {
          l.addFont(Future.value(ByteData.view(File(f).readAsBytesSync().buffer)));
        }
        await tester.runAsync(l.load);
      }
    }
    final png = await tester.runAsync(() => schoolPushPicture(kind: 'fee_receipt', schoolName: 'Green Valley Public School', schoolColor: const Color(0xFF1F6B4F)));
    expect(png!.sublist(0, 4), Uint8List.fromList([0x89, 0x50, 0x4E, 0x47])); // the PNG signature
    if (out != null) File(out).writeAsBytesSync(png); // to look at it: PUSH_PICTURE_OUT=pic.png flutter test
  });
}
