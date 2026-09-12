package com.novadrift.gacha;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Shell for the NOVA DRIFT prototype. The whole game lives in
 * assets/game and runs inside this WebView; this class only sets up the
 * surface, keeps the screen awake, and forwards the hardware back button
 * into the game's own screen stack.
 */
public class MainActivity extends Activity {

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        goFullscreen();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // the game's save file lives here
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFF05070F);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        setContentView(web);
        web.loadUrl("file:///android_asset/game/index.html");
    }

    private void goFullscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars());
                c.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public void onBackPressed() {
        // Let the game decide first: it returns "true" when it consumed the
        // press by closing a modal or walking back a screen.
        web.evaluateJavascript("window.Nova && Nova.handleBack ? Nova.handleBack() : false",
                value -> {
                    if (!"true".equals(value)) {
                        moveTaskToBack(true);
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        goFullscreen();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
