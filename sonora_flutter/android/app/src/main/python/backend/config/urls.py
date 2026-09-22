from django.urls import include, path, re_path

from backend.frontend_app import serve_frontend

urlpatterns = [
    path('api/', include('backend.core.urls')),
    re_path(r'^(?P<path>.*)$', serve_frontend, name='frontend'),
]