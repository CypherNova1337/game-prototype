package com.novadrift.gacha;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * The save file, kept out of the WebView.
 *
 * The game's progress is written to app-private storage and authenticated
 * with an HMAC whose key is generated inside the Android Keystore and is
 * not extractable — so a save edited on the device (or restored from
 * another one) fails verification and is refused rather than trusted.
 *
 * This is tamper-evidence for a local prototype, not an anti-cheat system:
 * the roll itself still happens on the client. Moving summons server-side
 * is the real fix and is tracked in docs/SECURITY.md.
 *
 * Exposed to JavaScript, so every method treats its input as hostile:
 * the page can only ever hand over a bounded blob, and gets back either a
 * verified blob or nothing.
 */
public final class SaveVault {

    private static final String TAG = "NovaDrift";
    private static final String KEY_ALIAS = "nova_save_hmac_v1";
    private static final String FILE_NAME = "save.bin";
    private static final int MAX_BYTES = 512 * 1024;

    private final Context context;

    SaveVault(Context context) {
        this.context = context.getApplicationContext();
    }

    /** @return the stored payload, or "" when absent, unreadable or tampered with. */
    @JavascriptInterface
    public String read() {
        try {
            File file = new File(context.getFilesDir(), FILE_NAME);
            if (!file.exists() || file.length() > MAX_BYTES) return "";

            byte[] raw = readAll(file);
            String stored = new String(raw, StandardCharsets.UTF_8);
            int split = stored.indexOf('.');
            if (split <= 0) return "";

            String signature = stored.substring(0, split);
            String payload = stored.substring(split + 1);

            byte[] expected = Base64.decode(signature, Base64.NO_WRAP);
            byte[] actual = sign(payload.getBytes(StandardCharsets.UTF_8));
            if (actual == null || !MessageDigest.isEqual(expected, actual)) {
                Log.w(TAG, "save failed integrity check, ignoring it");
                return "";
            }
            return payload;
        } catch (Exception e) {
            Log.w(TAG, "save read failed: " + e.getClass().getSimpleName());
            return "";
        }
    }

    /** @return true when the payload was written and signed. */
    @JavascriptInterface
    public boolean write(String payload) {
        if (payload == null) return false;
        byte[] body = payload.getBytes(StandardCharsets.UTF_8);
        if (body.length > MAX_BYTES) {
            Log.w(TAG, "save rejected: over size limit");
            return false;
        }
        try {
            byte[] mac = sign(body);
            if (mac == null) return false;
            String stored = Base64.encodeToString(mac, Base64.NO_WRAP) + "." + payload;

            File tmp = new File(context.getFilesDir(), FILE_NAME + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(stored.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            // Rename last so a kill mid-write can never leave a torn save.
            return tmp.renameTo(new File(context.getFilesDir(), FILE_NAME));
        } catch (Exception e) {
            Log.w(TAG, "save write failed: " + e.getClass().getSimpleName());
            return false;
        }
    }

    @JavascriptInterface
    public boolean wipe() {
        File file = new File(context.getFilesDir(), FILE_NAME);
        return !file.exists() || file.delete();
    }

    /** Names the backing store for the in-game diagnostics panel. */
    @JavascriptInterface
    public String backend() {
        return "device keystore";
    }

    private byte[] sign(byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key());
            return mac.doFinal(body);
        } catch (Exception e) {
            Log.w(TAG, "hmac unavailable: " + e.getClass().getSimpleName());
            return null;
        }
    }

    /** Fetch the non-extractable HMAC key, generating it on first run. */
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);

        KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }

        KeyGenerator gen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build());
        return gen.generateKey();
    }

    private static byte[] readAll(File file) throws IOException {
        try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
            byte[] buf = new byte[(int) raf.length()];
            raf.readFully(buf);
            return buf;
        }
    }
}
