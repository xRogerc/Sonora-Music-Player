from django.contrib import admin
from django.urls import include, path, re_path

from config.frontend_app import serve_frontend

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    re_path(r'^(?P<path>.*)$', serve_frontend, name='frontend'),
]