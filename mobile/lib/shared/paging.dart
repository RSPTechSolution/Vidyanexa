import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';

/// A list loaded a page at a time, that knows how many there are in all. It is a normal [List] of what's loaded,
/// so screens that just show the items don't need to know about paging.
class PagedList<T> extends ListBase<T> {
  PagedList(this._items, this.total);
  final List<T> _items;

  /// How many there are on the server.
  final int total;
  bool get hasMore => _items.length < total;

  @override
  int get length => _items.length;
  @override
  set length(int _) => throw UnsupportedError('PagedList is read-only');
  @override
  T operator [](int i) => _items[i];
  @override
  void operator []=(int i, T v) => throw UnsupportedError('PagedList is read-only');
}

/// How many pages of a list to show, by the list's name. Scrolling near the end adds a page; pulling to refresh keeps them.
class PageCount extends Notifier<int> {
  PageCount(this.list);
  final String list;
  @override
  int build() => 1;
  void more() => state++;
}

final pagesProvider = NotifierProvider.autoDispose.family<PageCount, int, String>(PageCount.new);

const pageSize = 25;

/// Fetches the first [pages] pages of [path] and joins them.
Future<PagedList<T>> fetchPages<T>(
  ApiClient api,
  String path,
  int pages,
  T Function(Map<String, dynamic>) parse, {
  Map<String, dynamic>? query,
}) async {
  final results = await Future.wait([
    for (var p = 1; p <= pages; p++)
      api.get<List<T>>(
        path,
        query: {...?query, 'page': p, 'page_size': pageSize},
        parse: (d) => [for (final x in (d as List).cast<Map>()) parse(x.cast<String, dynamic>())],
      ),
  ]);
  final seen = <Object?>{};
  final items = <T>[];
  for (final r in results) {
    for (final x in r.data) {
      if (seen.add(x is Object ? _id(x) : x)) items.add(x);
    }
  }
  final total = (results.first.meta?['total'] as num?)?.toInt() ?? items.length;
  return PagedList(items, total);
}

Object? _id(Object x) {
  try {
    return (x as dynamic).id;
  } catch (_) {
    return x;
  }
}

/// The end of a paged list: "Showing 25 of 140", and the next page loads by itself as the list scrolls near the end
/// (a screen ahead, so it is usually there before it is reached). Goes at the end of a scrolling list.
class LoadMoreTile extends ConsumerStatefulWidget {
  const LoadMoreTile({super.key, required this.list, required this.items, this.noun = 'items'});
  final String list;
  final List<Object?> items;
  final String noun;

  @override
  ConsumerState<LoadMoreTile> createState() => _LoadMoreTileState();
}

class _LoadMoreTileState extends ConsumerState<LoadMoreTile> {
  /// How far from the end the next page is fetched.
  static const _ahead = 600.0;
  ScrollPosition? _position;

  /// The list as it was when the next page was asked for: loading until a new one arrives, even one that adds nothing.
  List<Object?>? _waitingOn;

  bool get _loading => identical(_waitingOn, widget.items);

  /// More on the server, and not already asked for. Bounded by the pages asked for, so a list whose pages overlap (an
  /// item added at the top meanwhile) can't keep asking forever.
  bool get _canLoad {
    final items = widget.items;
    return items is PagedList &&
        items.hasMore &&
        !_loading &&
        ref.read(pagesProvider(widget.list)) * pageSize < items.total;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final position = Scrollable.maybeOf(context)?.position;
    if (position != _position) {
      _position?.removeListener(_check);
      _position = position?..addListener(_check);
    }
    _checkSoon();
  }

  @override
  void didUpdateWidget(LoadMoreTile old) {
    super.didUpdateWidget(old);
    _checkSoon(); // a page arrived: if it didn't fill the screen, get the next one
  }

  @override
  void dispose() {
    _position?.removeListener(_check);
    super.dispose();
  }

  void _checkSoon() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (mounted) _check();
  });

  void _check() {
    final position = _position;
    if (position == null || !position.hasContentDimensions || !_canLoad) return;
    if (position.extentAfter > _ahead) return;
    setState(() => _waitingOn = widget.items);
    ref.read(pagesProvider(widget.list).notifier).more();
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    if (items is! PagedList || items.total == 0) return const SizedBox.shrink();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final loading = _loading && items.hasMore;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (loading) ...[
            const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
          ],
          Semantics(
            liveRegion: true,
            child: Text(
              '${loading ? 'Loading more… ' : ''}Showing ${items.length} of ${items.total} ${widget.noun}',
              style: TextStyle(fontSize: 12, color: muted),
            ),
          ),
        ],
      ),
    );
  }
}
