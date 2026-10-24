"""School emails look like the school's own: its colour band, logo and details on top, its name as the sender, replies to
its office. Vidyanexa appears only as a small line in the footer."""
import io

from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.models import School, StoredFile
from app.services import email_service, email_templates as t
from app.services.email_service import CONSOLE_OUTBOX
from tests.factories import API


async def _brand(db, school, **settings_) -> School:
    school.name = "Green Valley Public School"
    school.address, school.city, school.state = "Sector 21-C", "Chandigarh", "Punjab"
    school.phone, school.email = "+91 172 270 1234", "office@greenvalley.edu.in"
    school.settings = {**(school.settings or {}), **settings_}
    await db.commit()
    return school


async def test_a_school_email_carries_the_school_branding(db, school):
    await _brand(db, school, brand_color="#15803d")
    school.logo_url = "https://apis.vidyanexa.com/api/v1/files/public/logo-1"
    await db.commit()
    CONSOLE_OUTBOX.clear()
    msg = t.welcome(to="priya@example.com", name="Priya Verma", role_label="Teacher", school_name=school.name, school_slug=school.slug, password="Kx7-mQ2p")
    await email_service.queue(db, msg, school_id=school.id)

    sent = CONSOLE_OUTBOX[-1]
    assert sent.from_name == "Green Valley Public School via Vidyanexa" and sent.reply_to == "office@greenvalley.edu.in"
    html = sent.html
    assert "background:#15803d;padding:22px 28px" in html  # the colour band in the school's colour
    assert "https://apis.vidyanexa.com/api/v1/files/public/logo-1" in html  # its logo
    assert "Sector 21-C, Chandigarh, Punjab" in html and "+91 172 270 1234 · office@greenvalley.edu.in" in html
    assert "background:#15803d;color:#ffffff" in html  # the button in the school colour
    assert "VIDYANEXA" not in html  # no Vidyanexa letterhead...
    assert "Sent using" in html and "email-crest.png" in html  # ...only the footer line
    assert "you have an account at Green Valley Public School" in html
    # The plain-text version says the same.
    assert sent.text.startswith("Green Valley Public School\nSector 21-C, Chandigarh, Punjab")
    assert "Temporary password: Kx7-mQ2p" in sent.text and sent.text.rstrip().endswith("Sent using Vidyanexa · https://www.vidyanexa.com")


async def test_without_a_logo_the_school_initials_stand_in(db, school):
    await _brand(db, school)  # no colour chosen either: navy
    school.logo_url = None
    await db.commit()
    msg = t.login_code(to="parent@example.com", name="Suresh Patel", school_name=school.name, code="482915", minutes=10)
    await email_service.queue(db, msg, school_id=school.id)
    html = CONSOLE_OUTBOX[-1].html
    assert ">GV</td>" in html and f"background:{t.NAVY};padding:22px 28px" in html


async def test_platform_emails_keep_the_vidyanexa_letterhead(db):
    msg = t.password_reset(to="root@example.com", name="Platform Admin", school_name=None, token="tok", minutes=30)
    await email_service.queue(db, msg, school_id=None)
    sent = CONSOLE_OUTBOX[-1]
    assert "VIDYANEXA" in sent.html and sent.from_name is None and sent.reply_to is None


async def test_brevo_gets_the_school_as_sender_name_and_reply_to(monkeypatch):
    sent = {}

    class FakeClient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers, json):
            sent.update(json)
            return type("R", (), {"status_code": 201, "text": ""})()

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "brevo")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setattr(email_service.httpx, "AsyncClient", FakeClient)
    msg = email_service.Email(to="a@example.com", subject="s", html="<p>x</p>", text="x",
                              from_name="Green Valley Public School via Vidyanexa", reply_to="office@greenvalley.edu.in")
    await email_service.deliver(msg)
    assert sent["sender"]["name"] == "Green Valley Public School via Vidyanexa"
    assert sent["replyTo"] == {"email": "office@greenvalley.edu.in"}


async def test_school_logos_are_kept_as_small_pngs_for_email(client, db, school, admin_headers):
    buf = io.BytesIO()
    Image.new("RGB", (1600, 1200), (21, 128, 61)).save(buf, "JPEG", quality=95)
    r = await client.post(f"{API}/files", headers=admin_headers, data={"purpose": "school_logo", "owner_id": str(school.id)},
                          files={"file": ("crest.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 201, r.text
    f = await db.scalar(select(StoredFile).where(StoredFile.purpose == "school_logo"))
    assert f.content_type == "image/png" and f.filename == "crest.png"
    img = Image.open(io.BytesIO((await client.get(f"{API}/files/public/{f.id}")).content))
    assert img.format == "PNG" and max(img.size) == 512
