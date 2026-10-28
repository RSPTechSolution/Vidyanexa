"""Roles, permissions and the module registry.

super_admin passes every permission check. Every other role must be listed.
"""
from enum import StrEnum


class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    SCHOOL_ADMIN = "school_admin"
    PRINCIPAL = "principal"
    TEACHER = "teacher"
    ACCOUNTANT = "accountant"
    RECEPTIONIST = "receptionist"
    LIBRARIAN = "librarian"
    HR_MANAGER = "hr_manager"
    TRANSPORT_MANAGER = "transport_manager"
    SECURITY_GUARD = "security_guard"
    STAFF = "staff"
    DRIVER = "driver"
    PARENT = "parent"
    STUDENT = "student"


SCHOOL_ROLES = [r for r in Role if r != Role.SUPER_ADMIN]
STAFF_ROLES = [Role.SCHOOL_ADMIN, Role.PRINCIPAL, Role.TEACHER, Role.ACCOUNTANT, Role.RECEPTIONIST,
               Role.LIBRARIAN, Role.HR_MANAGER, Role.TRANSPORT_MANAGER, Role.SECURITY_GUARD, Role.STAFF]
ADMINS = [Role.SCHOOL_ADMIN, Role.PRINCIPAL]

PERMISSIONS: dict[str, list[Role]] = {
    "school.view": SCHOOL_ROLES,
    "school.manage": [Role.SCHOOL_ADMIN],
    "modules.manage": [Role.SCHOOL_ADMIN],
    "school.export": [Role.SCHOOL_ADMIN],  # download all of the school's data
    "users.view": ADMINS + [Role.HR_MANAGER],
    "users.manage": [Role.SCHOOL_ADMIN],
    "audit.view": ADMINS,
    "emails.view": ADMINS,
    "emails.manage": [Role.SCHOOL_ADMIN],
    "billing.view": ADMINS + [Role.ACCOUNTANT],
    "students.view": ADMINS + [Role.TEACHER, Role.RECEPTIONIST, Role.ACCOUNTANT],
    "students.manage": ADMINS + [Role.RECEPTIONIST],
    "classes.manage": ADMINS,
    "timetable.view": ADMINS + [Role.TEACHER, Role.RECEPTIONIST],
    "timetable.manage": ADMINS,
    "attendance.view": ADMINS + [Role.TEACHER, Role.RECEPTIONIST],
    "attendance.mark": ADMINS + [Role.TEACHER],  # teachers: only sections they teach
    "attendance.manage": ADMINS,  # any section, any past date
    "attendance.scan": ADMINS + [Role.TEACHER, Role.RECEPTIONIST, Role.SECURITY_GUARD],  # QR scan at the gate or in class
    "leave.approve": ADMINS + [Role.TEACHER],  # teachers: their own class's students
    "calendar.manage": ADMINS + [Role.RECEPTIONIST],
    "devices.manage": [Role.SCHOOL_ADMIN],
    "fees.view": ADMINS + [Role.ACCOUNTANT, Role.RECEPTIONIST],
    "fees.collect": ADMINS + [Role.ACCOUNTANT, Role.RECEPTIONIST],
    "fees.manage": [Role.SCHOOL_ADMIN, Role.ACCOUNTANT],
    "accounts.view": ADMINS + [Role.ACCOUNTANT],
    "accounts.manage": [Role.SCHOOL_ADMIN, Role.ACCOUNTANT],
    "exams.view": ADMINS + [Role.TEACHER],
    "exams.marks": ADMINS + [Role.TEACHER],  # teachers: papers for sections they teach that subject in
    "exams.manage": ADMINS,  # create exams, date sheets, publish results
    "notices.post": ADMINS + [Role.TEACHER, Role.RECEPTIONIST],  # teachers: only to classes they teach
    "notices.manage": ADMINS + [Role.RECEPTIONIST],  # any audience, edit or remove any notice
    "homework.manage": ADMINS + [Role.TEACHER],
    "hr.view": ADMINS + [Role.HR_MANAGER, Role.ACCOUNTANT],  # accountants run payroll from the HR page
    "hr.manage": [Role.SCHOOL_ADMIN, Role.HR_MANAGER],
    "payroll.view": ADMINS + [Role.HR_MANAGER, Role.ACCOUNTANT],
    "payroll.manage": [Role.SCHOOL_ADMIN, Role.HR_MANAGER, Role.ACCOUNTANT],
    "transport.view": ADMINS + [Role.TRANSPORT_MANAGER],
    "transport.manage": [Role.SCHOOL_ADMIN, Role.TRANSPORT_MANAGER],
    "transport.drive": [Role.DRIVER, Role.SCHOOL_ADMIN, Role.TRANSPORT_MANAGER],  # admins can run a trip on a driver's behalf
    "library.view": ADMINS + [Role.LIBRARIAN, Role.TEACHER],  # teachers can search the catalogue
    "library.manage": [Role.SCHOOL_ADMIN, Role.LIBRARIAN],
    "hostel.view": ADMINS + [Role.RECEPTIONIST],
    "hostel.manage": [Role.SCHOOL_ADMIN, Role.PRINCIPAL],
    "inventory.view": ADMINS + [Role.ACCOUNTANT, Role.STAFF],
    "inventory.manage": [Role.SCHOOL_ADMIN, Role.ACCOUNTANT],
    "analytics.view": ADMINS,
    "ai.use": STAFF_ROLES,  # each answer still checks the permission its data needs
    "gate.view": ADMINS + [Role.SECURITY_GUARD, Role.RECEPTIONIST],
    "gate.manage": ADMINS + [Role.SECURITY_GUARD, Role.RECEPTIONIST],  # visitors in and out, gate passes at the gate, workers in and out
    "gatepass.issue": ADMINS + [Role.RECEPTIONIST],  # the office issues a pass on the spot (already approved)
    "visitors.invite": STAFF_ROLES,  # any staff member can tell the gate they expect someone
    "workers.manage": [Role.SCHOOL_ADMIN, Role.PRINCIPAL],
    "compliance.view": ADMINS,
    "compliance.manage": [Role.SCHOOL_ADMIN, Role.PRINCIPAL],
    "cctv.manage": [Role.SCHOOL_ADMIN, Role.PRINCIPAL],
    "ptm.manage": ADMINS + [Role.RECEPTIONIST],
    "surveys.manage": ADMINS,
    "tests.manage": ADMINS + [Role.TEACHER],  # question bank and online tests, for subjects they teach
    "live.manage": ADMINS + [Role.TEACHER],
    "syllabus.manage": ADMINS + [Role.TEACHER],  # teachers: classes and subjects they teach
    "certificates.manage": ADMINS + [Role.RECEPTIONIST],
    "admissions.manage": ADMINS + [Role.RECEPTIONIST],
    "students.promote": ADMINS,
    "substitutions.manage": ADMINS,
    "billing.manage": [Role.SCHOOL_ADMIN],
    "schools.manage": [],  # platform level: super_admin only
}


# Module registry. `default` modules are enabled for every new school. `preview` modules are still being built: they
# aren't sold or shown to schools, and work only where the platform owner has switched them on for a school (to test).
# To launch one, remove its `preview` flag.
MODULES: dict[str, dict] = {
    "students":      {"label": "Students", "default": True},
    "academics":     {"label": "Academics", "default": True},
    "attendance":    {"label": "Attendance", "default": True},
    "fees":          {"label": "Fee Management", "default": True},
    "accounts":      {"label": "Accounts", "default": False},
    "exams":         {"label": "Examinations", "default": True},
    "communication": {"label": "Communication", "default": True},
    "transport":     {"label": "Transport", "default": False},
    "hr":            {"label": "HR & Payroll", "default": True},
    "library":       {"label": "Library", "default": False},
    "hostel":        {"label": "Hostel", "default": False, "preview": True},
    "inventory":     {"label": "Inventory & Assets", "default": False},
    "security":      {"label": "Gate & Security", "default": False},
    "cctv":          {"label": "CCTV", "default": False, "preview": True},
    "ai":            {"label": "AI Assistant", "default": False},
    "analytics":     {"label": "Analytics", "default": True},
}


PREVIEW_MODULES = frozenset(k for k, v in MODULES.items() if v.get("preview"))
ON_SALE_MODULES = [k for k in MODULES if k not in PREVIEW_MODULES]


def preview_modules_for(settings: dict | None) -> set[str]:
    """Preview modules the platform owner has switched on for a school (kept in its settings by the platform only)."""
    return set((settings or {}).get("preview_modules") or []) & PREVIEW_MODULES


def has_permission(role: str, permission: str) -> bool:
    if role == Role.SUPER_ADMIN:
        return True
    return role in PERMISSIONS.get(permission, [])
