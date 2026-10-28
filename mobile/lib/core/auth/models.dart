class SchoolBrief {
  const SchoolBrief({required this.id, required this.name, required this.slug, required this.timezone, required this.currency, this.brandColor});

  final String id;
  final String name;
  final String slug;
  final String timezone;
  final String currency;

  /// The school's accent colour (e.g. "#0f766e"), if it picked one; the app's colours are built from it.
  final String? brandColor;

  factory SchoolBrief.fromJson(Map<String, dynamic> j) => SchoolBrief(
    id: j['id'] as String,
    name: j['name'] as String,
    slug: j['slug'] as String,
    timezone: j['timezone'] as String,
    currency: j['currency'] as String,
    brandColor: j['brand_color'] as String?,
  );
}

/// The signed-in user, as returned by `/auth/me` and `/auth/login`.
class Me {
  const Me({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.mustChangePassword,
    this.phone,
    this.school,
    this.lastLoginAt,
    this.modules = const [],
    this.permissions = const [],
  });

  final String id;
  final String email;
  final String fullName;
  final String role;
  final bool mustChangePassword;
  final String? phone;
  final SchoolBrief? school;
  final DateTime? lastLoginAt;
  final List<String> modules;
  final List<String> permissions;

  /// The name to greet by: "Dr. Rajesh Kumar" → "Rajesh" (titles such as Dr., Mr., Mrs. and Prof. skipped).
  String get firstName {
    final words = fullName.trim().split(RegExp(r'\s+'));
    final title = RegExp(r'^(dr|mr|mrs|ms|miss|prof|sir|smt|shri|sri)\.?$', caseSensitive: false);
    return words.firstWhere((w) => !title.hasMatch(w), orElse: () => words.first);
  }

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts.first[0];
    final last = parts.length > 1 ? parts.last[0] : '';
    return (first + last).toUpperCase();
  }

  factory Me.fromJson(Map<String, dynamic> j) => Me(
    id: j['id'] as String,
    email: j['email'] as String,
    fullName: j['full_name'] as String,
    role: j['role'] as String,
    mustChangePassword: j['must_change_password'] as bool? ?? false,
    phone: j['phone'] as String?,
    school: j['school'] is Map ? SchoolBrief.fromJson((j['school'] as Map).cast<String, dynamic>()) : null,
    lastLoginAt: j['last_login_at'] != null ? DateTime.tryParse(j['last_login_at'] as String) : null,
    modules: (j['modules'] as List?)?.cast<String>() ?? const [],
    permissions: (j['permissions'] as List?)?.cast<String>() ?? const [],
  );
}

const roleLabels = {
  'super_admin': 'Platform admin',
  'school_admin': 'School admin',
  'principal': 'Principal',
  'teacher': 'Teacher',
  'accountant': 'Accountant',
  'receptionist': 'Receptionist',
  'librarian': 'Librarian',
  'hr_manager': 'HR manager',
  'transport_manager': 'Transport manager',
  'security_guard': 'Security guard',
  'staff': 'Staff',
  'driver': 'Driver',
  'parent': 'Parent',
  'student': 'Student',
};

String roleLabel(String role) => roleLabels[role] ?? role.replaceAll('_', ' ');
