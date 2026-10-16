import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-secret" if DEBUG else "")
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is not 1")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")

INSTALLED_APPS = [
    "rest_framework",
    "planner",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# No models: the planner is stateless.
DATABASES = {}

REST_FRAMEWORK = {
    # JSON only: the browsable API needs templates and sessions, which this app does not have.
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "planner.views.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {"plan": "10/min", "geocode": "60/min"},
    # Proxies in front of the app whose X-Forwarded-For entries to trust; the throttles key on the client IP.
    "NUM_PROXIES": int(os.environ.get("DJANGO_NUM_PROXIES", "0")),
}

TIME_ZONE = "UTC"
USE_TZ = True

# Read by the provider modules only; never logged or sent to the browser.
TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")

# One key=value line per event on stdout. Messages never carry URLs, params or keys.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"line": {"format": "ts=%(asctime)s level=%(levelname)s logger=%(name)s %(message)s"}},
    "handlers": {
        "stdout": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "line"}
    },
    "loggers": {"planner": {"handlers": ["stdout"], "level": "INFO"}},
}

# Error tracking is off unless SENTRY_DSN is set.
if SENTRY_DSN := os.environ.get("SENTRY_DSN"):
    import sentry_sdk

    def _drop_http_breadcrumbs(crumb: dict, hint: dict) -> dict | None:
        """Provider URLs carry the API key in the query string."""
        return None if crumb.get("category") in ("httplib", "http") else crumb

    sentry_sdk.init(dsn=SENTRY_DSN, send_default_pii=False, before_breadcrumb=_drop_http_breadcrumbs)
