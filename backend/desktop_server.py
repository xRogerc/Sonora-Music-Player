import os
import sys
from pathlib import Path

DATA_DIR = Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))) / 'SONORA'
DB_PATH_DEFAULT = str(DATA_DIR / 'sonora.db')
LOG_PATH = str(DATA_DIR / 'sonora.log')


def _traceback():
    import traceback
    return traceback.format_exc()


def find_frontend_dir():
    env = os.environ.get('SONORA_FRONTEND', '').strip()
    if env:
        candidate = Path(env)
        if (candidate / 'index.html').is_file():
            return str(candidate)
    if getattr(sys, 'frozen', False):
        candidate = Path(sys._MEIPASS) / 'frontend'
        if (candidate / 'index.html').is_file():
            return str(candidate)
    here = Path(__file__).resolve().parent
    for candidate in (here.parent.parent / 'frontend', here.parent / 'frontend'):
        if (candidate / 'index.html').is_file():
            return str(candidate)
    raise RuntimeError('frontend nao encontrado')


def main():
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w', encoding='utf-8')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w', encoding='utf-8')

    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
        os.environ['DB_PATH'] = DB_PATH_DEFAULT

        frontend_dir = find_frontend_dir()
        os.environ['SONORA_FRONTEND'] = frontend_dir

        import config.settings

        import django
        django.setup()
        import config.urls
        import core.urls
        from django.core.management import call_command, execute_from_command_line

        try:
            call_command('migrate', verbosity=0, interactive=False)
        except Exception:
            with open(LOG_PATH, 'a', encoding='utf-8') as f:
                f.write('migrate failed:\n' + _traceback() + '\n')

        sys.argv = ['manage.py', 'runserver', '127.0.0.1:8010', '--noreload']
        execute_from_command_line()
    except Exception:
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write('server failed:\n' + _traceback() + '\n')
        raise


if __name__ == '__main__':
    main()