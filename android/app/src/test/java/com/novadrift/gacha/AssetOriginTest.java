package com.novadrift.gacha;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * The URL-to-asset mapping is the only parser in the app that turns
 * outside input into a file lookup, so it gets tested directly.
 */
public class AssetOriginTest {

    @Test
    public void servesTheIndexForRootPaths() {
        assertEquals("index.html", AssetOrigin.normalise("/"));
        assertEquals("index.html", AssetOrigin.normalise(""));
        assertEquals("index.html", AssetOrigin.normalise(null));
    }

    @Test
    public void resolvesOrdinaryAssets() {
        assertEquals("index.html", AssetOrigin.normalise("/index.html"));
        assertEquals("js/ui.js", AssetOrigin.normalise("/js/ui.js"));
        assertEquals("css/style.css", AssetOrigin.normalise("/css/style.css"));
        assertEquals("js/my-file_2.js", AssetOrigin.normalise("/js/my-file_2.js"));
    }

    @Test
    public void refusesTraversalOutOfTheAssetRoot() {
        assertNull(AssetOrigin.normalise("/../AndroidManifest.xml"));
        assertNull(AssetOrigin.normalise("/js/../../secrets.txt"));
        assertNull(AssetOrigin.normalise("/./hidden"));
        assertNull(AssetOrigin.normalise("//evil.example/x.js"));
    }

    @Test
    public void refusesAnythingOutsideTheAllowedCharacterSet() {
        assertNull(AssetOrigin.normalise("/js/ui.js?cache=1"));
        assertNull(AssetOrigin.normalise("/js/space file.js"));
        assertNull(AssetOrigin.normalise("/js/" + BACKSLASH + "windows"));
        assertNull(AssetOrigin.normalise("/js/<script>"));
        assertNull(AssetOrigin.normalise("/js/%2e%2e/up"));
    }

    private static final String BACKSLASH = "\\";
}
