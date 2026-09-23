# 🎵 SONORA — Music Player
<img width="1919" height="1007" alt="image" src="https://github.com/user-attachments/assets/6bccfe29-10e0-425c-a5d7-975ef2a04f9b" />


O **SONORA** é um player de música que integra buscas no **YouTube Music**, streaming de áudio e uma biblioteca local — tudo em um único aplicativo que roda em **Windows (desktop)**, **navegador (PWA)** e **smartphones (Android)**. O projeto demonstra arquitetura completa: backend **Django REST**, frontend web responsivo, launcher desktop nativo e app móvel Flutter com **Python embutido via Chaquopy**.


---


## 🧠 Como o SONORA Funciona

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SONORA (multi-plataforma)                        │
├───────────────┬──────────────────┬──────────────┬──────────────────────┤
│  backend\     │  frontend\       │  desktop\    │  sonora_flutter\      │
│  Django+DRF   │  PWA web         │  WPF C#      │  Flutter + Chaquopy   │
│  ytmusicapi   │  index.html      │  SONORA.bat  │  APK Android          │
│  yt-dlp       │  app.js          │  SONORA.exe  │  (Python embutido)    │
│  SQLite       │  sw.js (offline) │  launcher    │  WebView              │
└───────────────┴──────────────────┴──────────────┴──────────────────────┘
```

* **`backend/`** — Servidor **Django + Django REST Framework**. Faz a busca no **YouTube Music** (via `ytmusicapi`), extrai/streaming de mídia (via `yt-dlp`) e serve a API em `http://127.0.0.1:8010/`. O banco é **SQLite** (`sonora.db`) gravado em `%LOCALAPPDATA%\SONORA\`. No desktop, é empacotado como um exe standalone via PyInstaller (`backend\build_server.bat` → `dist\sonora-server.exe`), sem depender de Python na máquina de destino.
* **`frontend/`** — Aplicação web **PWA** (HTML/CSS/JS puros). Contém `index.html`, `app.js`, `style.css`, service worker (`sw.js`, funciona offline) e manifesto. É servida pelo backend e/ou nginx.
* **`desktop/`** — Cliente nativo **WPF (C# / .NET 8)**, o `SONORA.exe`. Inicia o servidor Django empacotado (`server\sonora-server.exe`, via PyInstaller) em segundo plano, exibe a webapp via WebView2 e serve como launcher. `SONORA.bat` e `SONORA.spec` (PyInstaller) acompanham.
* **`sonora_flutter/`** — App **Flutter para Android** com **Chaquopy** (Python 3.12 embutido no Gradle). Roda o mesmo Django/DRF dentro do APK e exibe a interface via WebView — sem precisar de servidor externo.
* **`SONORA.bat`** — Atalho de desenvolvimento: sobe o backend via Python do `backend\.venv` (`backend\desktop_main.py`) e abre a interface. Para o executável distribuível, use o fluxo do passo 2 abaixo.


---


## ✨ Funcionalidades

### 🚀 Reprodutor & Streaming
* **Player completo:** pautar, pular, retroceder, modo aleatório (shuffle) e repetição.
* **Barra de progresso dinâmica:** tempo decorrido × duração total da faixa.
* **Controle de volume integrado:** ajuste rápido via interface.

### 🔍 Descoberta Musical
* **Busca global:** localize músicas, artistas e álbuns no YouTube Music.
* **Músicas similares:** sugestões correlacionadas ao artista/gênero da faixa atual.

### 📚 Biblioteca & Histórico
* **Painel de estatísticas:** faixas na fila, tempo total e músicas tocadas em tempo real.
* **Gráficos de histórico:** linha do tempo com barras que categorizam as faixas por duração (*curta / média / longa*).

### 📱 Multi-Plataforma
* **Windows:** app nativo WPF com launcher (`SONORA.exe`).
* **Web:** PWA instalável, com suporte offline.
* **Android:** APK Flutter com Chaquopy (backend Python embutido).


---


## 🗂️ Estrutura do Projeto

```
MusicPlayer/
├── backend/                # Django REST API + DRF (ytmusicapi + yt-dlp)
│   ├── config/             # settings, urls, wsgi
│   ├── core/               # app Django (API, modelos, views)
│   ├── desktop_main.py     # entry point do launcher desktop (porta 8010)
│   ├── desktop_server.py   # bootstrap do Django (migra + runserver)
│   ├── build_server.bat    # empacota desktop_server.py (PyInstaller → sonora-server.exe)
│   ├── sonora-server.spec  # spec PyInstaller do servidor standalone
│   ├── manage.py
│   └── requirements.txt
├── frontend/               # PWA (HTML/CSS/JS) — index.html, app.js,
│                           # styles.css, sw.js, manifest, nginx.dockerfile
├── desktop/
│   └── SonoraApp/          # Cliente WPF C# .NET 8 (AssemblyName=SONORA)
│       ├── MainWindow.xaml # WebView2 embutido
│       ├── SonoraApp.csproj
│       └── bin/.../publish # SONORA.exe + server\sonora-server.exe + frontend
├── sonora_flutter/         # App Flutter (Android) com Chaquopy
│   ├── lib/                # código Dart
│   ├── android/            # Gradle + Chaquopy (Python 3.12 embutido)
│   └── pubspec.yaml
├── SONORA.bat              # launcher dev (usa backend\.venv): pythonw backend\desktop_main.py
├── SONORA.spec             # spec PyInstaller do launcher (entry=desktop_main.py)
└── SONORA.ico              # ícone
```


---


## 🚀 Como Rodar

### Pré-requisitos
* **Python 3.10–3.12** + pip
* **.NET SDK 8** (para o desktop WPF)
* **Flutter SDK** (para o app Android)

### 1. Backend (servidor + API)
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8010
```
API em `http://127.0.0.1:8010/` e frontend em `http://127.0.0.1:8010/`.

### 2. Desktop (Windows)
Para desenvolvimento, `SONORA.bat` usa o Python do `backend\.venv` (criado no
passo 1) para subir o backend e abrir a interface.

Para gerar o **executável distribuível** (funciona sem Python instalado na
máquina de destino), o backend é empacotado num exe standalone. O
`build_server.bat` reusa o `backend\.venv` (ou um python global com as
dependências do `requirements.txt` já instaladas):

```bash
# 1. (opcional, se ainda não tiver a .venv do passo anterior) cria e instala o backend
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt

# 2. Empacota o servidor Django em um único exe (instala PyInstaller se preciso)
backend\build_server.bat
# gera backend\dist\sonora-server.exe

# 3. Publica o app WPF (copia sonora-server.exe e frontend/ ao lado do SONORA.exe)
cd desktop\SonoraApp
dotnet publish -c Release -r win-x64 --self-contained true
# saída em desktop\SonoraApp\bin\Release\net8.0-windows\win-x64\publish\
#   SONORA.exe
#   server\sonora-server.exe
#   frontend\...
```

O `SONORA.exe` inicia o `server\sonora-server.exe` (PyInstaller) em segundo
plano e abre a interface via WebView2 — sem depender de Python nem de venv na
máquina do usuário final.

### 3. App Android (Flutter + Chaquopy)
```bash
cd sonora_flutter
flutter pub get
flutter build apk --debug
# APK em build\app\outputs\flutter-apk\app-debug.apk
```
O Gradle (Chaquopy) baixa e embute o Python + Django/DRF dentro do APK — instala direto no celular, sem servidor externo.


---


## ⚖️ Aviso Legal (Disclaimer)

* Este software é disponibilizado **gratuitamente, "no estado em que se encontra"** (As-Is), exclusivamente para fins **educacionais, estudo de desenvolvimento de software e portfólio acadêmico**.
* **Sem fins lucrativos:** o SONORA é um projeto 100% **open source**. Sem monetização, taxas, assinaturas ou anúncios neste repositório.
* **Propriedade intelectual:** o SONORA **não armazena, não hospeda e não distribui** nenhum arquivo de mídia. Todo o conteúdo acessado dinamicamente pertence aos seus respectivos detentores de direitos, artistas e plataformas de origem.
* **Uso pessoal:** o uso que viole os Termos de Serviço de plataformas terceiras é de responsabilidade única e exclusiva do usuário final. O desenvolvedor não apoia nem se responsabiliza por usos comerciais indevidos ou violações de direitos autorais causadas por terceiros.

*A reprodução de música está sujeita aos Termos de Serviço e à legislação de direitos autorais do seu país.*


---


## 📄 Licença

Distribuído sob a licença **GNU General Public License v3.0 (GPLv3)** — o código permanece livre e aberto à comunidade, e **ninguém pode fechar o código ou vendê-lo comercialmente**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.


---
Componente de portfólio desenvolvido por **Rogerc_** ([github.com/xRogerc](https://github.com/xRogerc)) 🚀
