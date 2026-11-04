import 'package:eduvia/core/api/api_client.dart';
import 'package:eduvia/core/auth/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_api.dart';

void main() {
  late FakeApi fake;
  late MemoryTokenStore tokens;
  late ApiClient api;
  var expired = 0;

  setUp(() {
    fake = FakeApi();
    tokens = MemoryTokenStore()
      ..access = 'access-old'
      ..refresh = 'refresh-old';
    expired = 0;
    api = ApiClient(baseUrl: 'http://test', tokens: tokens, adapter: fake, onSessionExpired: () => expired++);
  });

  test('unwraps the data envelope and sends the bearer token', () async {
    fake.on('GET /auth/me', (req) {
      expect(req.headers['Authorization'], 'Bearer access-old');
      return (200, FakeApi.ok({'id': 'u1'}));
    });
    final res = await api.get<Map<String, dynamic>>('/auth/me', parse: (j) => j as Map<String, dynamic>);
    expect(res.data['id'], 'u1');
  });

  test('server errors become ApiException with code and message', () async {
    fake.on('POST /auth/login', (_) => (401, FakeApi.err('INVALID_CREDENTIALS', 'Invalid email or password')));
    expect(
      () => api.post('/auth/login', auth: false, body: {}),
      throwsA(isA<ApiException>()
          .having((e) => e.code, 'code', 'INVALID_CREDENTIALS')
          .having((e) => e.message, 'message', 'Invalid email or password')),
    );
  });

  test('concurrent 401s trigger exactly one refresh, then all requests succeed', () async {
    var refreshes = 0;
    fake.on('POST /auth/refresh', (req) {
      refreshes++;
      expect(req.data, {'refresh_token': 'refresh-old'});
      return (200, FakeApi.ok(tokensJson('new')));
    });
    fake.on('GET /data', (req) => req.headers['Authorization'] == 'Bearer access-new'
        ? (200, FakeApi.ok('fresh'))
        : (401, FakeApi.err('TOKEN_EXPIRED', 'Access token expired')));

    final results = await Future.wait(List.generate(4, (_) => api.get<String>('/data')));
    expect(results.map((r) => r.data), everyElement('fresh'));
    expect(refreshes, 1);
    expect(tokens.refresh, 'refresh-new');
    expect(expired, 0);
  });

  test('rejected refresh clears tokens and reports the expired session', () async {
    fake.on('GET /data', (_) => (401, FakeApi.err('TOKEN_EXPIRED', 'expired')));
    fake.on('POST /auth/refresh', (_) => (401, FakeApi.err('INVALID_REFRESH_TOKEN', 'Invalid refresh token')));
    await expectLater(api.get('/data'), throwsA(isA<ApiException>()));
    expect(tokens.refresh, isNull);
    expect(expired, 1);
  });

  test('network failure keeps the session and reports a connection error', () async {
    fake.offline = true;
    await expectLater(api.get('/data'), throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true)));
    expect(tokens.refresh, 'refresh-old');
    expect(expired, 0);
  });

  test('wrong-password 401 is not treated as an expired session', () async {
    fake.on('POST /auth/login', (_) => (401, FakeApi.err('INVALID_CREDENTIALS', 'bad')));
    await expectLater(api.post('/auth/login', auth: false, body: {}), throwsA(isA<ApiException>()));
    expect(fake.calls.where((c) => c.contains('refresh')), isEmpty);
  });
}
