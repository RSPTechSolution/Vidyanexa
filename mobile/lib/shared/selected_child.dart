import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The child a parent with more than one child is looking at, shared by Home and the Attendance, Homework, Fees and
/// Results tabs: choosing a child in one shows that child everywhere. Null until a child is chosen (then the first).
final selectedChildProvider = NotifierProvider<SelectedChild, String?>(SelectedChild.new);

class SelectedChild extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String studentId) => state = studentId;
}

/// Where the chosen child is in [ids] (a screen's own list of children), or the first child.
int childIndex(WidgetRef ref, List<String> ids) {
  final id = ref.watch(selectedChildProvider);
  final i = id == null ? -1 : ids.indexOf(id);
  return i < 0 ? 0 : i;
}

/// Choose the child at [index] of [ids], for every screen.
void selectChild(WidgetRef ref, List<String> ids, int index) {
  if (index >= 0 && index < ids.length) ref.read(selectedChildProvider.notifier).select(ids[index]);
}
