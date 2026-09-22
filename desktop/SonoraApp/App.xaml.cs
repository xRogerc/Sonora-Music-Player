using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace SonoraApp
{
    public partial class App : Application
    {
        private static readonly string LogPath =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                         "SONORA", "app.log");

        protected override void OnStartup(StartupEventArgs e)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            DispatcherUnhandledException += (_, args) =>
            {
                Log("Dispatcher: " + args.Exception);
                args.Handled = true;
            };
            AppDomain.CurrentDomain.UnhandledException += (_, args) =>
                Log("Domain: " + args.ExceptionObject);
            base.OnStartup(e);
        }

        private static void Log(string text)
        {
            try
            {
                File.AppendAllText(LogPath,
                    DateTime.Now.ToString("HH:mm:ss") + " " + text + Environment.NewLine);
            }
            catch
            {
            }
        }
    }
}