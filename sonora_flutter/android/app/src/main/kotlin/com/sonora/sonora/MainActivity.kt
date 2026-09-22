package com.sonora.sonora

import android.os.Bundle
import android.util.Log
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    companion object {
        private const val CHANNEL = "sonora/server"
        private const val PORT = 9100
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    Thread {
                        try {
                            if (!Python.isStarted()) {
                                Python.start(AndroidPlatform(applicationContext))
                            }
                            val dbPath = filesDir.absolutePath + "/sonora.db"
                            Python.getInstance().getModule("run_server").callAttr("start", PORT, dbPath)
                        } catch (e: Exception) {
                            Log.e("SONORA", "falha ao iniciar servidor embutido", e)
                        }
                    }.start()
                    result.success(PORT)
                }
                "error" -> {
                    Thread {
                        try {
                            if (Python.isStarted()) {
                                val err = Python.getInstance().getModule("run_server").callAttr("server_error")
                                result.success(if (err == null) "" else err.toString())
                            } else {
                                result.success("Python não iniciado ainda")
                            }
                        } catch (e: Exception) {
                            result.success("Erro ao ler status: " + e.message)
                        }
                    }.start()
                }
                else -> result.notImplemented()
            }
        }
    }
}