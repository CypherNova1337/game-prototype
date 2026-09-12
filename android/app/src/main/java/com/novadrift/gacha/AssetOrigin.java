package com.novadrift.gacha;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves the game's assets over a real https origin instead of file://.
 *
 * appassets.androidplatform.net is reserved for exactly this and never
 * resolves on the public internet, so the page gets a normal secure origin
 * (working DOM storage, enforceable CSP) while every byte still comes out
 * of the APK. Anything not under that origin is refused outright.
 */
final class AssetOrigin {

    static final String SCHEME = "https";
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = SCHEME + "://" + HOST;
    static final String START_URL = ORIGIN + "/index.html";

    /** Assets live here inside the APK; the URL path is resolved against it. */
    private static final String ASSET_ROOT = "game";

    /**
     * No remote code, no inline scripts, no outbound connections of any
     * kind. Style is allowed inline because rarity tints are set as
     * per-element custom properties; scripts never are.
     */
    private static final String CSP =
            "default-src 'none'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            "font-src 'self'; " +
            "connect-src 'none'; " +
            "form-action 'none'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'none'; " +
            "object-src 'none'";

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("webp", "image/webp");
        MIME.put("json", "application/json");
        MIME.put("woff2", "font/woff2");
    }

    private final AssetManager assets;

    AssetOrigin(AssetManager assets) {
        this.assets = assets;
    }

    static boolean isOurs(Uri uri) {
        return uri != null && SCHEME.equals(uri.getScheme()) && HOST.equals(uri.getHost());
    }

    /** Resolve a request, or null to let the WebView handle it (it never should). */
    WebResourceResponse handle(WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!isOurs(uri)) return blocked();
        if (!"GET".equalsIgnoreCase(request.getMethod())) return blocked();

        String path = normalise(uri.getPath());
        if (path == null) return blocked();

        try {
            InputStream in = assets.open(ASSET_ROOT + "/" + path);
            return new WebResourceResponse(mimeFor(path), "utf-8", 200, "OK", headers(), in);
        } catch (IOException notFound) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    headers(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden",
                headers(), new ByteArrayInputStream(new byte[0]));
    }

    private static Map<String, String> headers() {
        Map<String, String> h = new HashMap<>();
        h.put("Content-Security-Policy", CSP);
        h.put("X-Content-Type-Options", "nosniff");
        h.put("Cache-Control", "no-store");
        h.put("Referrer-Policy", "no-referrer");
        return h;
    }

    /**
     * Map a URL path onto an asset path.
     *
     * Every segment is validated on its own: empty segments (which is what
     * "//host/x" collapses to), "." and "..", dotfiles and any character
     * outside a deliberately small set all reject the whole path. Nothing
     * is ever unescaped here, so there is no second decoding pass for an
     * encoded separator to slip through.
     */
    static String normalise(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) return "index.html";

        String trimmed = path.startsWith("/") ? path.substring(1) : path;
        if (trimmed.isEmpty()) return "index.html";

        String[] segments = trimmed.split("/", -1);
        StringBuilder out = new StringBuilder();

        for (String segment : segments) {
            if (segment.isEmpty()) return null;
            if (".".equals(segment) || "..".equals(segment)) return null;
            if (segment.charAt(0) == '.') return null;
            for (int i = 0; i < segment.length(); i++) {
                if (!isAllowed(segment.charAt(i))) return null;
            }
            if (out.length() > 0) out.append('/');
            out.append(segment);
        }
        return out.toString();
    }

    private static boolean isAllowed(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '_';
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase();
        String mime = MIME.get(ext);
        return mime != null ? mime : "application/octet-stream";
    }
}
