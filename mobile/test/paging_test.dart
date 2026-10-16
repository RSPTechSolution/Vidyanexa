import 'dart:math';

import 'package:eduvia/shared/paging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// 60 on the "server", served a page at a time.
final _items = Provider.autoDispose<PagedList<int>>((ref) {
  final pages = ref.watch(pagesProvider('test'));
  return PagedList(List.generate(min(pages * pageSize, 60), (i) => i), 60);
});

class _List extends ConsumerWidget {
  const _List();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(_items);
    return ListView.builder(
      itemCount: list.length + 1,
      itemBuilder: (_, i) => i == list.length
          ? LoadMoreTile(list: 'test', items: list, noun: 'things')
          : SizedBox(height: 60, child: Text('Row $i')),
    );
  }
}

void main() {
  testWidgets('a long list loads the next page by itself near the end, with no button', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: _List())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Showing 25 of 60 things', skipOffstage: false), findsNothing); // not built until near the end
    expect(find.byType(OutlinedButton), findsNothing);

    // Nothing more is fetched while the end is far away.
    final container = ProviderScope.containerOf(tester.element(find.byType(_List)));
    expect(container.read(pagesProvider('test')), 1);

    await tester.dragUntilVisible(find.textContaining('Showing'), find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(container.read(pagesProvider('test')), 2);
    expect(find.text('Row 25', skipOffstage: false), findsOneWidget);

    // To the very end: the last page comes, and then no more is asked for.
    await tester.fling(find.byType(ListView), const Offset(0, -6000), 3000);
    await tester.pumpAndSettle();
    await tester.fling(find.byType(ListView), const Offset(0, -6000), 3000);
    await tester.pumpAndSettle();
    expect(find.text('Showing 60 of 60 things'), findsOneWidget);
    expect(container.read(pagesProvider('test')), 3);
  });
}
