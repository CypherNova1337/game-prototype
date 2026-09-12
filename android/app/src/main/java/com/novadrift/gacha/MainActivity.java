package com.novadrift.gacha;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

/**
 * Host for the game.
 *
 * Deliberately not edge-to-edge: the previous build hid the status bar and
 * drew under the system bars, which put the navigation bar (and the gesture
 * strip that comes with it) directly on top of the bottom tab row and ate
 * taps meant for the game. The window now fits the system insets.
 */
public class MainActivity extends Activity {

    private static final String TAG = "NovaDrift";

    private WebView web;
    private AssetOrigin origin;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        try {
            web = new WebView(this);
        } catch (Exception e) {
            // A missing or mid-update WebView provider would otherwise show a
            // blank window with no explanation.
            showFatal("Android System WebView is unavailable on this device.\n\n"
                    + e.getClass().getSimpleName());
            return;
        }

        origin = new AssetOrigin(getAssets());
        configure(web.getSettings());

        web.setBackgroundColor(0xFF05070F);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new GameClient());
        web.setWebChromeClient(new LoggingChrome());

        // One narrow bridge, on an origin that can only ever load our own
        // assets and cannot reach the network at all (see AssetOrigin's CSP).
        web.addJavascriptInterface(new SaveVault(this), "NovaSave");

        setContentView(web);
        web.loadUrl(AssetOrigin.START_URL);
    }

    private void configure(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);

        // Nothing outside the APK is reachable, by policy and by settings.
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);
        s.setDatabaseEnabled(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);

        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    }

    /** Last-resort UI so a failure is never a silent black screen. */
    private void showFatal(String message) {
        TextView tv = new TextView(this);
        tv.setText("NOVA DRIFT could not start.\n\n" + message);
        tv.setTextColor(Color.parseColor("#DCE7F5"));
        tv.setBackgroundColor(Color.parseColor("#05070F"));
        tv.setPadding(48, 96, 48, 48);
        tv.setTextSize(15f);
        setContentView(tv);
    }

    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return origin.handle(request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // The game never navigates. Anything trying to is refused.
            if (!AssetOrigin.isOurs(request.getUrl())) {
                Log.w(TAG, "blocked navigation to " + request.getUrl().getScheme());
                return true;
            }
            return false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                Log.e(TAG, "main frame failed: " + error.getDescription());
                showFatal("The game files could not be read from the app package.\n\n"
                        + error.getDescription());
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Returning true keeps the app alive instead of letting the
            // system kill it with no message.
            Log.e(TAG, "web renderer died, crashed=" + detail.didCrash());
            showFatal("The game view stopped responding and was shut down.\n\n"
                    + "Reopen the app to continue; your progress was saved.");
            web = null;
            return true;
        }
    }

    private static final class LoggingChrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            // Surfaces game-side errors in `adb logcat -s NovaDrift`.
            Log.i(TAG, m.messageLevel() + " " + m.message()
                    + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        // The game answers first: it consumes the press to close a sheet or
        // step back a screen, and declines when it is already at the top.
        web.evaluateJavascript("window.Nova && Nova.handleBack ? Nova.handleBack() : false",
                value -> {
                    if (!"true".equals(value)) moveTaskToBack(true);
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
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
