import os
import sys
import threading
import traceback

LAST_ERROR = None
STARTED = threading.Event()


def start(port=9100, db_path=None, frontend_dir=None):
    global LAST_ERROR
    if db_path:
        os.environ['DB_PATH'] = db_path
    if frontend_dir:
        os.environ['SONORA_FRONTEND'] = frontend_dir
    threading.Thread(target=_runner, kwargs={'port': port}, daemon=True).start()


def server_error():
    return LAST_ERROR


def _runner(port):
    global LAST_ERROR
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings_android')
    try:
        import django
        django.setup()
        from django.core.management import call_command
        try:
            call_command('migrate', verbosity=0, interactive=False)
        except Exception:
            traceback.print_exc()
        from django.core.management import execute_from_command_line
        sys.argv = ['manage.py', 'runserver', '127.0.0.1:%d' % port, '--noreload']
        execute_from_command_line()
    except Exception:
        LAST_ERROR = traceback.format_exc()
        traceback.print_exc()