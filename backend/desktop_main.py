import logging
import os
import queue
import sys
import threading
import time
import tkinter as tk
import webbrowser
from tkinter import scrolledtext

PORT = 8010

MUSICPLAYER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
APP_DATA = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
DATA_DIR = os.path.join(APP_DATA, 'SONORA')
DB_PATH_DEFAULT = os.path.join(DATA_DIR, 'sonora.db')
LOG_PATH = os.path.join(DATA_DIR, 'sonora.log')


def log_dir():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except Exception:
        pass


def setup_logger():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(LOG_PATH, encoding='utf-8'),
        ],
    )


def find_frontend_dir():
    if getattr(sys, 'frozen', False):
        candidate = os.path.join(sys._MEIPASS, 'frontend')
        if os.path.isdir(candidate):
            return candidate
    candidate = os.path.join(MUSICPLAYER_ROOT, 'frontend')
    if os.path.isdir(candidate):
        return candidate
    raise RuntimeError('frontend nao encontrado em: %s' % candidate)


def server_thread(ready, logq):
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w', encoding='utf-8')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w', encoding='utf-8')
    os.makedirs(DATA_DIR, exist_ok=True)
    os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
    os.environ['DB_PATH'] = DB_PATH_DEFAULT
    frontend_dir = find_frontend_dir()
    os.environ['SONORA_FRONTEND'] = frontend_dir
    logq.put('Banco de dados: %s' % DB_PATH_DEFAULT)
    logq.put('Frontend: %s' % frontend_dir)

    import config.settings

    import django
    django.setup()
    import config.urls
    import core.urls
    from django.core.management import call_command, execute_from_command_line
    try:
        call_command('migrate', verbosity=0, interactive=False)
        logq.put('Migracoes aplicadas.')
    except Exception:
        logging.exception('falha na migracao (ignorada)')
        logq.put('Aviso: migracao falhou (continuando).')

    sys.argv = ['manage.py', 'runserver', '127.0.0.1:%d' % PORT, '--noreload']
    try:
        logq.put('Servidor SONORA subindo em http://127.0.0.1:%d/' % PORT)
        ready.set()
        execute_from_command_line()
    except Exception:
        logging.exception('erro fatal no servidor')
        logq.put('ERRO: %r' % sys.exc_info()[1])


class App:
    def __init__(self, root):
        self.root = root
        self.opened = False
        root.title('SONORA')
        root.geometry('460x360')
        root.configure(bg='#0c0d0c')
        root.protocol('WM_DELETE_WINDOW', self.exit)

        head = tk.Label(root, text='SONORA', bg='#0c0d0c', fg='#b6ff3c',
                        font=('Segoe UI', 26, 'bold'))
        head.pack(pady=(14, 2))
        sub = tk.Label(root, text='Player de música local', bg='#0c0d0c', fg='#9a9c9a')
        sub.pack()

        self.status = tk.Label(root, text='Iniciando servidor...', bg='#0c0d0c',
                               fg='#f4f5f1')
        self.status.pack(pady=8)

        btn_row = tk.Frame(root, bg='#0c0d0c')
        btn_row.pack(pady=6)
        self.open_btn = tk.Button(btn_row, text='Abrir SONORA', state='disabled',
                                  command=self.open_browser, bg='#b6ff3c',
                                  fg='#0c0d0c', font=('Segoe UI', 11, 'bold'),
                                  padx=14, pady=6, bd=0)
        self.open_btn.pack(side='left', padx=6)
        close_btn = tk.Button(btn_row, text='Sair', command=self.exit,
                              bg='#1d201c', fg='#f4f5f1', padx=14, pady=6, bd=0)
        close_btn.pack(side='left', padx=6)

        self.log = scrolledtext.ScrolledText(root, height=8, bg='#12130f',
                                             fg='#c9cbc7', bd=0,
                                             font=('Consolas', 9))
        self.log.pack(fill='both', expand=True, padx=12, pady=(4, 12))
        self.log.configure(state='disabled')

        self.q = queue.Queue()
        threading.Thread(target=self._monitor, daemon=True).start()
        self.root.after(150, self._drain_log)

    def _monitor(self):
        ready = threading.Event()
        t = threading.Thread(target=server_thread, args=(ready, self.q), daemon=True)
        t.start()
        if ready.wait(60):
            self.q.put('PRONTO')
        else:
            self.q.put('DEMORA')

    def _drain_log(self):
        try:
            while True:
                msg = self.q.get_nowait()
                if msg == 'PRONTO':
                    self.status.configure(text='Servidor pronto em http://127.0.0.1:%d/' % PORT)
                    self.open_btn.configure(state='normal')
                    if not self.opened:
                        self.opened = True
                        self.open_browser()
                elif msg == 'DEMORA':
                    self.status.configure(text='Servidor demorando para subir (veja o log).')
                else:
                    self._append(msg)
        except queue.Empty:
            pass
        self.root.after(150, self._drain_log)

    def _append(self, msg):
        self.log.configure(state='normal')
        self.log.insert('end', msg + '\n')
        self.log.see('end')
        self.log.configure(state='disabled')

    def open_browser(self):
        webbrowser.open('http://127.0.0.1:%d/' % PORT)

    def exit(self):
        self.root.destroy()


def main():
    log_dir()
    setup_logger()
    try:
        root = tk.Tk()
        App(root)
        root.mainloop()
    except Exception as e:
        logging.exception('erro na interface')
        print('Erro: %r' % e)


if __name__ == '__main__':
    main()