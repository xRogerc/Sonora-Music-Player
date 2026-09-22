import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views.decorators.http import require_GET

mimetypes.add_type('application/manifest+json', '.webmanifest')
mimetypes.add_type('text/javascript', '.js')


@require_GET
def serve_frontend(request, path=''):
    base = Path(settings.FRONTEND_DIR).resolve()
    if not path:
        path = 'index.html'
    target = (base / path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise Http404
    if target.is_dir():
        target = target / 'index.html'
    if not target.is_file():
        raise Http404
    content_type, _encoding = mimetypes.guess_type(str(target))
    if content_type is None:
        content_type = 'application/octet-stream'
    return FileResponse(target.open('rb'), content_type=content_type)