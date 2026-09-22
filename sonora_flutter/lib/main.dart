import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const SonoraApp());
}

class SonoraApp extends StatelessWidget {
  const SonoraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SONORA',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0C0D0C),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFB6FF3C),
          brightness: Brightness.dark,
        ),
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  static const _methodChannel = MethodChannel('sonora/server');
  static const _port = 9100;
  late final WebViewController _controller;
  bool _ready = false;
  String _status = 'Iniciando servidor SONORA...';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (error) {
            if (mounted) {
              setState(() => _status = 'Servidor ainda não respondeu...');
            }
          },
        ),
      );
    _boot();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed && _ready && mounted) {
      _controller.reload();
    }
  }

  Future<void> _boot() async {
    try {
      await _methodChannel.invokeMethod<int>('start');
    } catch (e) {
      _fail('Falha ao iniciar: $e');
      return;
    }
    for (var i = 0; i < 60; i++) {
      if (await _ping()) {
        if (!mounted) return;
        setState(() => _ready = true);
        await _controller.loadRequest(Uri.parse('http://127.0.0.1:$_port/'));
        return;
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    String? hint;
    try {
      hint = await _methodChannel
          .invokeMethod<String>('error')
          .timeout(const Duration(seconds: 3));
    } catch (_) {}
    _fail(hint != null && hint.isNotEmpty
        ? 'Servidor apresentou erro:\n$hint'
        : 'Servidor não respondeu. Verifique a internet e tente de novo.');
  }

  Future<bool> _ping() async {
    try {
      final socket = await Socket.connect('127.0.0.1', _port,
          timeout: const Duration(seconds: 2));
      socket.destroy();
      return true;
    } catch (_) {
      return false;
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() => _status = message);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _ready
          ? WebViewWidget(controller: _controller)
          : _Splash(status: _status),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF0C0D0C),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: const Color(0xFFB6FF3C),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.music_note, color: Color(0xFF0C0D0C), size: 40),
            ),
            const SizedBox(height: 18),
            const Text(
              'SONORA',
              style: TextStyle(
                color: Color(0xFFF4F5F1),
                fontSize: 26,
                fontWeight: FontWeight.w700,
                letterSpacing: 4,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              status,
              style: const TextStyle(color: Color(0xFF9A9C9A), fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 18),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Color(0xFFB6FF3C),
              ),
            ),
          ],
        ),
      ),
    );
  }
}