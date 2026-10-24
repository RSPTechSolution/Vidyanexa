from functools import lru_cache
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "Vidyanexa"
    ENVIRONMENT: str = "development"  # development | test | production
    DEBUG: bool = False

    # Runtime connection uses the non-owner role so row-level security applies.
    DATABASE_URL: str = "postgresql+asyncpg://eduvia_app:eduvia_app_dev@localhost:5433/eduvia"
    # Owner connection, used only by Alembic and test setup.
    MIGRATION_DATABASE_URL: str = "postgresql+asyncpg://eduvia:eduvia_owner_dev@localhost:5433/eduvia"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    REDIS_URL: str = "redis://localhost:6380/0"

    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30
    # AI assistant: "rules" answers from built-in templates; "anthropic" (Claude) or "gemini" (Google) picks the template
    # from free text and drafts notices. Only the question and class names are sent, never student data.
    AI_PROVIDER: str = "rules"  # rules | anthropic | gemini
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-haiku-5-5"
    GEMINI_API_KEY: str = ""  # from Google AI Studio (aistudio.google.com)
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    AI_DAILY_LIMIT: int = 100  # questions per user per day

    OTP_EXPIRE_MINUTES: int = 10
    OTP_DEBUG: bool = False  # outside production, return the sign-in code in the response (local testing only)
    BCRYPT_ROUNDS: int = 12

    LOGIN_RATE_LIMIT: int = 10           # attempts ...
    LOGIN_RATE_WINDOW_SECONDS: int = 900 # ... per 15 minutes per (ip, email)
    SIGNUP_RATE_LIMIT: int = 5           # school sign-ups per hour per IP
    CONTACT_RATE_LIMIT: int = 10         # contact/quote messages per hour per IP

    # Email: "console" logs messages instead of sending (development, tests); "brevo" sends.
    # A Brevo key starting xkeysib- uses Brevo's HTTP API; an SMTP key (xsmtpsib-) uses the SMTP relay
    # and needs BREVO_SMTP_LOGIN.
    EMAIL_PROVIDER: str = "console"
    BREVO_API_KEY: str = ""
    BREVO_SMTP_LOGIN: str = ""
    BREVO_SMTP_HOST: str = "smtp-relay.brevo.com"
    BREVO_SMTP_PORT: int = 587
    EMAIL_FROM: str = "no-reply@eduvia.local"
    EMAIL_FROM_NAME: str = "Vidyanexa"
    EMAIL_DAILY_LIMIT: int = 300  # Brevo's free plan
    # Never send to these domains: the demo data and tests use them, and demo.com is someone else's.
    EMAIL_SKIP_DOMAINS: Annotated[list[str], NoDecode] = ["demo.com", "students.demo.com", "example.com", "t.com", "eduvia.local"]

    # Uploaded files: "local" keeps them on disk under STORAGE_DIR (one folder per school), for development; "s3" keeps
    # them in an S3-compatible bucket (Cloudflare R2, Wasabi, AWS S3, MinIO). Switching provider is only these settings.
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_DIR: str = "storage"
    S3_ENDPOINT_URL: str = ""  # R2: https://<account-id>.r2.cloudflarestorage.com (empty = AWS)
    S3_REGION: str = "auto"  # R2: auto; AWS Mumbai: ap-south-1; Wasabi: e.g. ap-southeast-1
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET: str = ""  # uploaded files (private)
    S3_BACKUP_BUCKET: str = ""  # optional: a copy of every backup goes here, off the server
    # Serving files from the edge (e.g. https://media.vidyanexa.com, a Cloudflare Worker in front of the R2 bucket; see
    # infra/cloudflare/media). The API still checks who may see a file, then sends the browser to a signed link there
    # that stops working after MEDIA_LINK_MINUTES (up to twice that, so links stay the same and can be cached). Empty =
    # files are sent by the API itself. The Worker must have the same MEDIA_SIGNING_SECRET.
    MEDIA_BASE_URL: str = ""
    MEDIA_SIGNING_SECRET: str = ""
    MEDIA_LINK_MINUTES: int = 60
    # Schools are warned when their files reach this share of the plan's storage, and uploads stop at 100%.
    STORAGE_WARN_PERCENT: int = 80
    # Photos and pictures are shrunk to fit this many pixels on the long side and saved as WebP (if that's smaller).
    IMAGE_MAX_PX: int = 1600
    # Backups: a zip of every table under STORAGE_DIR/backups. BACKUP_DAILY makes one a day in the background.
    BACKUP_DAILY: bool = False
    BACKUP_KEEP: int = 14
    MAX_UPLOAD_MB: int = 10

    # Push notifications: "console" logs them; "fcm" sends through Firebase Cloud Messaging using the
    # service-account JSON file at FIREBASE_CREDENTIALS_FILE. In-app notifications work either way.
    # SMS and WhatsApp. "console" logs them (and records them in Settings > Messages) without sending.
    SMS_PROVIDER: str = "console"  # console | twilio | msg91
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM: str = ""
    MSG91_AUTH_KEY: str = ""
    MSG91_SENDER_ID: str = ""
    WHATSAPP_PROVIDER: str = "console"  # console | meta (WhatsApp Cloud API)
    WHATSAPP_TOKEN: str = ""
    WHATSAPP_PHONE_ID: str = ""

    PUSH_PROVIDER: str = "console"
    FIREBASE_CREDENTIALS_FILE: str = ""

    # Public address of this API, used in short-lived download links opened by the mobile apps.
    API_PUBLIC_URL: str = "http://localhost:8000"

    # Online payment is only for schools paying for their Vidyanexa subscription (plan price + 18% GST); school fees are
    # never paid online. "test" simulates a gateway (never allowed in production), "none" turns it off.
    # A real gateway (Razorpay) plugs in here later.
    PAYMENT_GATEWAY: str = "test"

    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # When the website runs elsewhere (e.g. Vercel), every web request reaches the API from the website's servers. The
    # website then sends the visitor's address in X-Client-IP with this shared secret, and only then is it believed, so
    # sign-in limits stay per visitor. Set the same value as WEB_PROXY_SECRET on the website. Empty = not used.
    WEB_PROXY_SECRET: str = ""
    APP_URL: str = "http://localhost:3000"

    @field_validator("EMAIL_SKIP_DOMAINS", mode="before")
    @classmethod
    def _split_domains(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [d.strip().lower() for d in v.split(",") if d.strip()]
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _check_secrets(self):
        if len(self.JWT_SECRET_KEY) < 32:
            raise ValueError("JWT_SECRET_KEY must be set and at least 32 characters long")
        if self.ENVIRONMENT == "production" and self.DEBUG:
            raise ValueError("DEBUG must be false in production")
        if self.EMAIL_PROVIDER == "brevo" and not self.BREVO_API_KEY:
            raise ValueError("EMAIL_PROVIDER=brevo needs BREVO_API_KEY")
        if self.EMAIL_PROVIDER == "brevo" and self.BREVO_API_KEY.startswith("xsmtpsib-") and not self.BREVO_SMTP_LOGIN:
            raise ValueError("A Brevo SMTP key needs BREVO_SMTP_LOGIN (shown next to the key in Brevo)")
        if self.PUSH_PROVIDER == "fcm" and not self.FIREBASE_CREDENTIALS_FILE:
            raise ValueError("PUSH_PROVIDER=fcm needs FIREBASE_CREDENTIALS_FILE (the Firebase service-account JSON)")
        if self.ENVIRONMENT == "production" and self.PAYMENT_GATEWAY == "test":
            raise ValueError("PAYMENT_GATEWAY=test is for development only")
        return self

    @property
    def is_test(self) -> bool:
        return self.ENVIRONMENT == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
