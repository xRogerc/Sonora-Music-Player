using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace SonoraApp
{
    public partial class MainWindow : Window
    {
        private const int Port = 8010;
        private readonly HttpClient _http = new();
        private Process? _server;

        public MainWindow()
        {
            InitializeComponent();
            Icon = MakeIcon();
            Loaded += async (_, _) => await StartAsync();
        }

        private static ImageSource MakeIcon()
        {
            var lime = new SolidColorBrush(Color.FromRgb(0xB6, 0xFF, 0x3C));
            var ink = new SolidColorBrush(Color.FromRgb(0x0C, 0x0D, 0x0C));
            var dg = new DrawingGroup();
            dg.Children.Add(new GeometryDrawing(lime, null,
                new EllipseGeometry(new Point(16, 16), 16, 16)));

            var fig = new PathFigure();
            fig.StartPoint = new Point(8, 23);
            fig.Segments.Add(new LineSegment(new Point(8, 11), true));
            fig.Segments.Add(new LineSegment(new Point(18, 9), true));
            fig.Segments.Add(new LineSegment(new Point(18, 19), true));
            var stem = new PathGeometry();
            stem.Figures.Add(fig);
            var pen = new Pen(ink, 3.2)
            {
                StartLineCap = PenLineCap.Round,
                EndLineCap = PenLineCap.Round,
                LineJoin = PenLineJoin.Round,
            };
            dg.Children.Add(new GeometryDrawing(null, pen, stem));
            dg.Children.Add(new GeometryDrawing(ink, null, new EllipseGeometry(new Point(6.5, 22), 3, 3)));
            dg.Children.Add(new GeometryDrawing(ink, null, new EllipseGeometry(new Point(16, 17.5), 3, 3)));
            return new DrawingImage(dg);
        }

        private async Task StartAsync()
        {
            LoadingText.Text = "Iniciando servidor interno...";

            string backendDir = await Task.Run(ResolveBackendDir);
            if (backendDir == string.Empty)
            {
                Fail("Pasta do backend nao encontrada.");
                return;
            }

            if (!ServerUp())
            {
                _server = SpawnBackend(backendDir);
                if (!await WaitForServerAsync())
                {
                    Fail("Servidor interno nao respondeu. Veja %LOCALAPPDATA%\\SONORA\\sonora.log");
                    return;
                }
            }

            LoadingText.Text = "Carregando SONORA...";

            try
            {
                var userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SONORA", "WebView2");
                Directory.CreateDirectory(userData);
                var env = await CoreWebView2Environment.CreateAsync(null, userData);
                await WebView.EnsureCoreWebView2Async(env);
                WebView.CoreWebView2.Navigate($"http://127.0.0.1:{Port}/");
            }
            catch (Exception ex)
            {
                Log("WebView2: " + ex);
                Fail("Nao foi possivel abrir o player (WebView2): " + ex.Message);
                return;
            }

            LoadingOverlay.Visibility = Visibility.Collapsed;
        }

        private static string ResolveBackendDir()
        {
            string cur = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
            for (int i = 0; i < 8; i++)
            {
                foreach (string cand in new[] { Path.Combine(cur, "backend"), cur })
                {
                    if (Directory.Exists(Path.Combine(cand, "config")) &&
                        File.Exists(Path.Combine(cand, "desktop_server.py")))
                        return Path.GetFullPath(cand);
                }
                string? parent = Path.GetDirectoryName(cur);
                if (parent is null || parent == cur)
                    break;
                cur = parent;
            }
            return string.Empty;
        }

        private Process? SpawnBackend(string backendDir)
        {
            string python = ResolvePython(backendDir);
            if (python == string.Empty)
                return null;

            string script = Path.Combine(backendDir, "desktop_server.py");
            var psi = new ProcessStartInfo
            {
                FileName = python,
                Arguments = $"\"{script}\"",
                WorkingDirectory = backendDir,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            try
            {
                return Process.Start(psi);
            }
            catch (Exception ex)
            {
                Fail("Falha ao iniciar servidor: " + ex.Message);
                return null;
            }
        }

        private static string ResolvePython(string backendDir)
        {
            string[] candidates =
            {
                Path.Combine(backendDir, ".venv", "Scripts", "pythonw.exe"),
                Path.Combine(backendDir, ".venv", "Scripts", "python.exe"),
            };
            foreach (string c in candidates)
                if (File.Exists(c))
                    return c;
            return string.Empty;
        }

        private bool ServerUp()
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                using var r = _http.GetAsync($"http://127.0.0.1:{Port}/", cts.Token).Result;
                return r.StatusCode == System.Net.HttpStatusCode.OK;
            }
            catch
            {
                return false;
            }
        }

        private async Task<bool> WaitForServerAsync()
        {
            var sw = Stopwatch.StartNew();
            while (sw.Elapsed < TimeSpan.FromSeconds(40))
            {
                if (ServerUp())
                    return true;
                await Task.Delay(400);
            }
            return false;
        }

        private void Fail(string message)
        {
            LoadingText.Text = message;
            LoadingOverlay.Visibility = Visibility.Visible;
        }

        private void OpenInBrowser_Click(object sender, RoutedEventArgs e)
        {
            try { Process.Start(new ProcessStartInfo($"http://127.0.0.1:{Port}/") { UseShellExecute = true }); }
            catch { }
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            try { _server?.Kill(); } catch { }
            try { _server?.Dispose(); } catch { }
            base.OnClosing(e);
        }

        private static void Log(string text)
        {
            try
            {
                string p = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SONORA", "app.log");
                File.AppendAllText(p, DateTime.Now.ToString("HH:mm:ss") + " " + text + Environment.NewLine);
            }
            catch { }
        }
    }
}