from httpx import AsyncClient

from sqlalchemy import select

from app.core.permissions import MODULES
from app.core.security import hash_password
from app.models import Plan, SchoolClass, School, SchoolModule, Section, User

PASSWORD = "Passw0rd!x"
API = "/api/v1"


async def school(db, slug: str, *, is_active: bool = True, plan: str = "pro", status: str = "active") -> School:
    p = await db.scalar(select(Plan).where(Plan.code == plan))
    s = School(name=f"{slug.title()} School", slug=slug, is_active=is_active, plan=p, subscription_status=status)
    db.add(s)
    await db.flush()
    for m, meta in MODULES.items():
        db.add(SchoolModule(school_id=s.id, module=m, is_enabled=meta["default"]))
    await db.commit()
    return s


async def user(db, school: School | None, email: str, role: str, *, is_active: bool = True,
               password: str = PASSWORD) -> User:
    u = User(school_id=school.id if school else None, email=email, full_name=email.split("@")[0].title(),
             role=role, is_active=is_active, password_hash=hash_password(password))
    db.add(u)
    await db.commit()
    return u


async def login(client: AsyncClient, email: str, password: str, slug: str | None):
    return await client.post(f"{API}/auth/login", json={"email": email, "password": password, "school_slug": slug})


async def login_headers(client: AsyncClient, email: str, password: str, slug: str | None) -> dict:
    res = await login(client, email, password, slug)
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['data']['tokens']['access_token']}"}


async def klass(db, school: School, name: str, sections: tuple[str, ...] = ("A",), capacity: int | None = None):
    c = SchoolClass(school_id=school.id, name=name, sort_order=1)
    db.add(c)
    await db.flush()
    secs = [Section(school_id=school.id, class_id=c.id, name=n, capacity=capacity) for n in sections]
    db.add_all(secs)
    await db.commit()
    return c, secs[0]


def student_body(section: Section, admission_no: str, **extra) -> dict:
    return {
        "first_name": "Riya", "last_name": "Sharma", "gender": "female", "date_of_birth": "2016-04-12",
        "admission_no": admission_no, "admission_date": "2024-04-01",
        "class_id": str(section.class_id), "section_id": str(section.id), **extra,
    }


async def signup(client: AsyncClient, body: dict, *, confirm: bool = True):
    """Sign a school up through the website form, and (unless `confirm=False`) enter the emailed code, as the person would."""
    from app.core.config import settings
    debug = settings.OTP_DEBUG
    settings.OTP_DEBUG = True  # the response carries the code, standing in for the person's inbox
    try:
        res = await client.post(f"{API}/public/signup", json=body)
    finally:
        settings.OTP_DEBUG = debug
    if confirm and res.status_code == 201:
        ok = await client.post(f"{API}/auth/login-code", json={"identifier": body["email"], "school_slug": body["school_slug"],
                                                                "code": res.json()["data"]["debug_code"]})
        assert ok.status_code == 200, ok.text
    return res
