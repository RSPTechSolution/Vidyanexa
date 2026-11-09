import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';

Map<String, dynamic> _map(Object? d) => (d as Map).cast<String, dynamic>();
final _hm = DateFormat('h:mm a');

// ---- driver -----------------------------------------------------------------------------------

final driverTodayProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  return (await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/transport/driver/today', parse: _map)).data;
});

/// Home-screen card for drivers.
class DriverCard extends ConsumerWidget {
  const DriverCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(driverTodayProvider).value;
    final vehicle = today?['vehicle'] as Map?;
    final running = today?['running'] as Map?;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: running != null ? statusColors(context).success.withValues(alpha: 0.1) : null,
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: Icon(Icons.directions_bus_rounded, size: 36, color: scheme.primary),
        title: Text(running != null ? 'Trip running: ${running['route_name']}' : 'Start a trip', style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(vehicle == null ? 'No bus is assigned to you yet. Ask the transport office.' : '${vehicle['number']} · ${(today!['routes'] as List).length} route(s)'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/driver'),
      ),
    );
  }
}

class DriverScreen extends ConsumerStatefulWidget {
  const DriverScreen({super.key});

  @override
  ConsumerState<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends ConsumerState<DriverScreen> {
  Map<String, dynamic>? _trip;
  Timer? _gps;
  String _gpsStatus = 'Location not shared yet';
  bool _busy = false;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void dispose() {
    _gps?.cancel();
    super.dispose();
  }

  void _track() {
    _gps?.cancel();
    _sendPosition();
    _gps = Timer.periodic(const Duration(seconds: 15), (_) => _sendPosition());
  }

  Future<void> _sendPosition() async {
    final trip = _trip;
    if (trip == null) return;
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        setState(() => _gpsStatus = 'Location permission is off. Parents can’t see the bus.');
        return;
      }
      final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      await _api.post<Object?>('/transport/trips/${trip['id']}/ping',
          body: {'lat': p.latitude, 'lng': p.longitude, 'speed': p.speed >= 0 ? p.speed * 3.6 : null});
      if (mounted) setState(() => _gpsStatus = 'Location shared at ${_hm.format(DateTime.now())}');
    } catch (e) {
      if (mounted) setState(() => _gpsStatus = 'Couldn’t read the location. Retrying…');
    }
  }

  Future<void> _start(String routeId, String direction) async {
    setState(() => _busy = true);
    try {
      final t = (await _api.post<Map<String, dynamic>>('/transport/trips', body: {'route_id': routeId, 'direction': direction}, parse: _map)).data;
      setState(() => _trip = t);
      _track();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _board(String studentId, String event) async {
    try {
      final t = (await _api.post<Map<String, dynamic>>('/transport/trips/${_trip!['id']}/board', body: {'student_id': studentId, 'event': event},
          parse: _map)).data;
      setState(() => _trip = t);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  Future<void> _end() async {
    try {
      await _api.post<Object?>('/transport/trips/${_trip!['id']}/end');
      _gps?.cancel();
      setState(() => _trip = null);
      ref.invalidate(driverTodayProvider);
      if (mounted) showSnack(context, 'Trip ended');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  Future<void> _sos() async {
    final msg = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
          title: const Text('Send SOS?'),
          content: TextField(controller: msg, decoration: const InputDecoration(hintText: 'What happened? (optional)')),
          actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
                    FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(c, true), child: const Text('Send SOS'))],
        ));
    if (ok != true) return;
    try {
      await _api.post<Object?>('/transport/sos', body: {'message': msg.text.trim().isEmpty ? null : msg.text.trim()});
      if (mounted) showSnack(context, 'SOS sent. The school office has been alerted.');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(driverTodayProvider);
    final s = statusColors(context);
    if (_trip == null && async.value?['running'] != null) {
      _trip = (async.value!['running'] as Map).cast<String, dynamic>();
      WidgetsBinding.instance.addPostFrameCallback((_) => _track());
    }
    final trip = _trip;
    return Scaffold(
      appBar: AppBar(title: const Text('Driver'), actions: [
        TextButton.icon(onPressed: _sos, icon: Icon(Icons.sos_rounded, color: s.danger), label: Text('SOS', style: TextStyle(color: s.danger, fontWeight: FontWeight.w800))),
      ]),
      body: AsyncView(
        value: async,
        loading: const SkeletonSummary(),
        onRetry: () => ref.invalidate(driverTodayProvider),
        builder: (today) {
          if (trip == null) {
            final routes = (today['routes'] as List).cast<Map>();
            if (routes.isEmpty) return const EmptyPanel(icon: Icons.directions_bus_outlined, title: 'No route assigned', message: 'Ask the transport office to assign your bus to a route.');
            return ListView(padding: const EdgeInsets.all(16), children: [
              for (final r in routes)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(r['name'] as String, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      Text('${(r['stops'] as List).length} stops · ${r['riders']} students'),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(child: FilledButton.icon(onPressed: _busy ? null : () => _start(r['id'] as String, 'pickup'), icon: const Icon(Icons.school_outlined), label: const Text('Morning pickup'))),
                        const SizedBox(width: 8),
                        Expanded(child: OutlinedButton.icon(onPressed: _busy ? null : () => _start(r['id'] as String, 'drop'), icon: const Icon(Icons.home_outlined), label: const Text('Drop home'))),
                      ]),
                    ]),
                  ),
                ),
            ]);
          }
          final roster = (trip['roster'] as List).cast<Map>();
          return ListView(padding: const EdgeInsets.all(12), children: [
            Card(
              color: s.success.withValues(alpha: 0.1),
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: Icon(Icons.gps_fixed_rounded, color: s.success),
                title: Text('${trip['route_name']} · ${trip['direction'] == 'pickup' ? 'to school' : 'home'}', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text('${trip['on_board']} of ${trip['riders']} on board\n$_gpsStatus'),
                isThreeLine: true,
              ),
            ),
            for (final r in roster)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  title: Text(r['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('${r['stop_name'] ?? 'No stop'} · ${r['class_section']}${r['absent'] == true ? ' · absent' : ''}'),
                  trailing: r['dropped_at'] != null
                      ? Icon(Icons.check_circle, color: s.success, semanticLabel: 'Dropped')
                      : r['boarded_at'] != null
                          ? OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                              onPressed: () => _board(r['student_id'] as String, 'dropped'), child: const Text('Got off'))
                          : Row(mainAxisSize: MainAxisSize.min, children: [
                              FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                                  onPressed: () => _board(r['student_id'] as String, 'boarded'), child: const Text('On bus')),
                              if (r['absent'] != true) IconButton(tooltip: 'Not at the stop', onPressed: () => _board(r['student_id'] as String, 'absent'), icon: const Icon(Icons.person_off_outlined)),
                            ]),
                ),
              ),
            const SizedBox(height: 12),
            OutlinedButton.icon(onPressed: _end, icon: const Icon(Icons.flag_outlined), label: const Text('End trip')),
          ]);
        },
      ),
    );
  }
}

// ---- families ---------------------------------------------------------------------------------

final myBusProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return (await ref.watch(apiClientProvider).get<List<Map<String, dynamic>>>('/transport/my',
      parse: (d) => [for (final x in (d as List).cast<Map>()) x.cast<String, dynamic>()])).data;
});

class MyBusScreen extends ConsumerStatefulWidget {
  const MyBusScreen({super.key});

  @override
  ConsumerState<MyBusScreen> createState() => _MyBusScreenState();
}

class _MyBusScreenState extends ConsumerState<MyBusScreen> {
  Timer? _refresh;

  @override
  void initState() {
    super.initState();
    _refresh = Timer.periodic(const Duration(seconds: 15), (_) => ref.invalidate(myBusProvider));
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myBusProvider);
    const events = {'boarded': 'Got on the bus', 'dropped': 'Got off the bus', 'absent': 'Didn’t come to the stop'};
    return Scaffold(
      appBar: AppBar(title: const Text('School bus')),
      body: AsyncView(
        value: async,
        loading: const SkeletonSummary(rows: 3),
        onRetry: () => ref.invalidate(myBusProvider),
        builder: (kids) => ListView(padding: const EdgeInsets.all(12), children: [
          for (final k in kids)
            Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(k['name'] as String, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  if (k['route'] == null)
                    const Text('Doesn’t use school transport.')
                  else ...[
                    Text('${(k['route'] as Map)['name']} · ${(k['route'] as Map)['vehicle_number'] ?? 'bus'}'),
                    if (k['stop'] != null) Text('Stop: ${(k['stop'] as Map)['name']}'),
                    const SizedBox(height: 8),
                    if (k['trip'] == null)
                      const Text('The bus isn’t on the road right now.')
                    else ...[
                      Text((k['trip'] as Map)['direction'] == 'pickup' ? 'On the way to school' : 'On the way home',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      if ((k['trip'] as Map)['lat'] != null)
                        TextButton.icon(
                          onPressed: () => launchUrl(Uri.parse('https://maps.google.com/?q=${(k['trip'] as Map)['lat']},${(k['trip'] as Map)['lng']}'),
                              mode: LaunchMode.externalApplication),
                          icon: const Icon(Icons.map_outlined),
                          label: const Text('See the bus on the map'),
                        ),
                    ],
                    for (final e in (k['today'] as List).cast<Map>())
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.check_circle_outline),
                        title: Text(events[e['event']] ?? e['event'] as String),
                        trailing: Text(_hm.format(DateTime.parse(e['at'] as String).toLocal())),
                      ),
                  ],
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}
