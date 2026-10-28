"""Price list for plans and the custom-plan builder. All amounts are whole INR,
exclusive of GST. The preset plans live in the `plans` table (editable by the
platform admin); this module prices *custom* plans so the website and the API
always quote the same number.
"""
from dataclasses import dataclass

from app.core.permissions import MODULES, PREVIEW_MODULES

GST_RATE = 0.18
TRIAL_DAYS = 14
YEARLY_MONTHS_CHARGED = 10  # pay yearly, get 2 months free

# Every plan includes these; they are free in the builder.
CORE_MODULES = ["students", "academics", "attendance"]

PLATFORM_FEE = 1499  # per month, covers hosting, backups, apps and support

MODULE_PRICES: dict[str, int] = {
    "students": 0,
    "academics": 0,
    "attendance": 0,
    "communication": 499,
    "fees": 799,
    "accounts": 499,
    "exams": 699,
    "transport": 999,
    "hr": 799,
    "library": 399,
    "hostel": 599,
    "inventory": 499,
    "security": 499,
    "cctv": 999,
    "ai": 1499,
    "analytics": 399,
}

# (students up to, price per student per month)
STUDENT_TIERS: list[tuple[int, float]] = [(500, 3.0), (2000, 2.0), (10_000, 1.5)]
MIN_STUDENTS = 50
MAX_SELF_SERVE_STUDENTS = 10_000

assert set(MODULE_PRICES) == set(MODULES), "every module needs a price"


@dataclass(frozen=True)
class Quote:
    modules: list[str]
    students: int
    max_staff: int
    storage_gb: int
    module_total: int
    student_total: int
    platform_fee: int
    monthly: int
    yearly: int


def student_charge(students: int) -> int:
    total, lower = 0.0, 0
    for upper, rate in STUDENT_TIERS:
        if students <= lower:
            break
        total += (min(students, upper) - lower) * rate
        lower = upper
    return round(total)


def quote(modules: list[str], students: int) -> Quote:
    """Price a custom plan. Unknown modules raise ValueError; core modules are always added."""
    unknown = sorted(set(modules) - (set(MODULES) - PREVIEW_MODULES))  # preview modules aren't on sale
    if unknown:
        raise ValueError(f"Unknown modules: {', '.join(unknown)}")
    if not MIN_STUDENTS <= students <= MAX_SELF_SERVE_STUDENTS:
        raise ValueError(f"Students must be between {MIN_STUDENTS} and {MAX_SELF_SERVE_STUDENTS}")
    chosen = [m for m in MODULES if m in set(modules) | set(CORE_MODULES)]  # registry order
    module_total = sum(MODULE_PRICES[m] for m in chosen)
    student_total = student_charge(students)
    monthly = PLATFORM_FEE + module_total + student_total
    return Quote(
        modules=chosen,
        students=students,
        max_staff=max(25, students // 8),
        storage_gb=max(10, students // 20),
        module_total=module_total,
        student_total=student_total,
        platform_fee=PLATFORM_FEE,
        monthly=monthly,
        yearly=monthly * YEARLY_MONTHS_CHARGED,
    )


# Preset plans, inserted by migration 0002. Kept here so tests and the seed agree.
PRESET_PLANS = [
    {
        "code": "basic",
        "name": "Basic",
        "tagline": "Everything a small school needs to go digital.",
        "price_monthly": 2999,
        "price_yearly": 29990,
        "max_students": 300,
        "max_staff": 25,
        "storage_gb": 10,
        "modules": ["students", "academics", "attendance", "fees", "communication", "analytics"],
        "features": [
            "Parent & student app",
            "Staff app",
            "Online fee collection",
            "SMS, email and app notifications",
            "Email support (next business day)",
            "Daily backups",
        ],
        "highlight": False,
        "sort_order": 1,
    },
    {
        "code": "pro",
        "name": "Pro",
        "tagline": "For growing schools that want every office on one system.",
        "price_monthly": 7999,
        "price_yearly": 79990,
        "max_students": 1500,
        "max_staff": 120,
        "storage_gb": 50,
        "modules": [
            "students", "academics", "attendance", "fees", "accounts", "exams", "communication",
            "transport", "hr", "library", "analytics",
        ],
        "features": [
            "Everything in Basic",
            "Exams, report cards and online tests",
            "Payroll and leave management",
            "Live bus tracking with driver app",
            "Priority support (4-hour response)",
            "Guided onboarding and data import",
        ],
        "highlight": True,
        "sort_order": 2,
    },
    {
        "code": "max",
        "name": "Max",
        "tagline": "For large schools and groups that need everything.",
        "price_monthly": 17999,
        "price_yearly": 179990,
        "max_students": None,
        "max_staff": None,
        "storage_gb": 500,
        "modules": list(MODULES),
        "features": [
            "Everything in Pro",
            "Unlimited students and staff",
            "AI assistant for school data",
            "Inventory and gate security",
            "Custom domain and white-label branding",
            "Dedicated success manager",
        ],
        "highlight": False,
        "sort_order": 3,
    },
]
