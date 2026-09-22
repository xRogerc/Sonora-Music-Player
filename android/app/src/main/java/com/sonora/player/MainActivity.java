package com.sonora.player;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    /**
     * URL do frontend SONORA.
     *  - Emulador Android Studio: http://10.0.2.2:8001/  (10.0.2.2 = host PC)
     *  - Celular físico: use o IP da sua máquina na rede local, ex.: http://192.168.0.10:8001/
     */
    private static final String WEB_URL = "http://10.0.2.2:8001/";

    /**
     * Base do backend Django (sem o "/api").
     *  - Emulador: http://10.0.2.2:8000
     *  - Celular físico: http://<IP-do-seu-PC>:8000
     */
    private static final String API_BASE = "http://10.0.2.2:8000";

    private WebView wv;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        wv = new WebView(this);
        setContentView(wv);

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        wv.addJavascriptInterface(new SonoraBridge(), "SonoraBridge");
        wv.setWebViewClient(new WebViewClient());
        wv.loadUrl(WEB_URL);
    }

    @Override
    public void onBackPressed() {
        if (wv != null && wv.canGoBack()) {
            wv.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private class SonoraBridge {
        @android.webkit.JavascriptInterface
        public String getApiBase() {
            return API_BASE;
        }
    }
}