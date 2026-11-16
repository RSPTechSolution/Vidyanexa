"""The push message sent to Firebase: grouped by kind on iPhones, and bus updates replace each other on Android."""
import httpx

from app.services import notification_service


class _Response:
    status_code = 200
    text = ""


def _capture(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    async def post(_self, _url, headers=None, json=None):  # noqa: A002 - httpx's own parameter name
        sent.append(json)
        return _Response()

    monkeypatch.setattr(notification_service, "_fcm_access_token", lambda: ("token", "project"))
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    return sent


async def test_a_push_is_grouped_by_kind(monkeypatch):
    sent = _capture(monkeypatch)
    item = {"title": "Fee received", "body": "Receipt sent", "data": {"kind": "fee_receipt", "link": "/my-fees"}}
    assert await notification_service._fcm_send("device", item) is True
    msg = sent[0]["message"]
    assert msg["notification"] == {"title": "Fee received", "body": "Receipt sent"}
    assert msg["data"]["kind"] == "fee_receipt"
    assert msg["apns"]["payload"]["aps"]["thread-id"] == "fee_receipt"
    assert "android" not in msg


async def test_a_bus_update_replaces_the_last_one(monkeypatch):
    sent = _capture(monkeypatch)
    item = {"title": "Bus 4 is 5 min away", "body": "", "data": {"kind": "transport", "link": "/my-transport"}}
    await notification_service._fcm_send("device", item)
    assert sent[0]["message"]["android"]["notification"]["tag"] == "transport"
