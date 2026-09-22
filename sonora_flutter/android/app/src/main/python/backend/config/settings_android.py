import os
from pathlib import Path

from . import settings as _s

BASE_DIR = _s.BASE_DIR

SECRET_KEY = 'sonora-android-embedded-secret-change-me'

DEBUG = False

ALLOWED_HOSTS = ['127.0.0.1', 'localhost']

INSTALLED_APPS = [
    a.replace('core', 'backend.core')
    for a in _s.INSTALLED_APPS
    if a not in ('django.contrib.admin',)
]

MIDDLEWARE = _s.MIDDLEWARE

ROOT_URLCONF = 'backend.config.urls'

TEMPLATES = _s.TEMPLATES

WSGI_APPLICATION = 'backend.config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.environ.get('DB_PATH', str(BASE_DIR / 'db.sqlite3')),
    }
}

AUTH_PASSWORD_VALIDATORS = _s.AUTH_PASSWORD_VALIDATORS

LANGUAGE_CODE = _s.LANGUAGE_CODE

TIME_ZONE = _s.TIME_ZONE

USE_I18N = _s.USE_I18N

USE_TZ = _s.USE_TZ

STATIC_URL = _s.STATIC_URL

DEFAULT_AUTO_FIELD = _s.DEFAULT_AUTO_FIELD

REST_FRAMEWORK = _s.REST_FRAMEWORK

CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_HEADERS = _s.CORS_ALLOW_HEADERS

FRONTEND_DIR = os.environ.get(
    'SONORA_FRONTEND',
    str(Path(__file__).resolve().parent.parent / 'frontend'),
)