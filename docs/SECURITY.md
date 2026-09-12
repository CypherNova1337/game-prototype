# Security model

Security gets designed in at each step rather than audited on at the end, so
this file states what the build assumes, what it actually enforces today, and
what every new feature has to satisfy before it ships.

## Threat model

The prototype is offline and single-player, so the realistic adversaries are:

1. **The player**, editing their own save to mint currency or units. Matters
   because the same save format follows us to the server phase — a client that
   is trusted now is a client that is trusted later by accident.
2. **Another app on the device**, reading or writing our files, or pulling the
   save out over `adb backup`.
3. **Hostile content reaching the WebView.** The game is a web page, so the
   standard web attacks apply the moment any byte from outside the APK can be
   rendered or any URL can be navigated to.
4. **The supply chain** — anything third-party that ends up inside the APK.

Out of scope for a prototype, and stated so nobody assumes otherwise: a rooted
device, a hostile OEM image, and physical attacks.

## What is enforced today

**The app asks for nothing.** No permissions are declared — not even
`INTERNET`. `aapt2 dump permissions` on the release APK returns zero. Adding
one is a reviewable change, not an accident.

**No plaintext networking is possible.** `usesCleartextTraffic="false"` plus a
network security config that trusts only system CAs, so the first network
feature has to be TLS from its first line.

**The save is tamper-evident.** Progress is written to app-private storage by
`SaveVault`, authenticated with HMAC-SHA256 whose key is generated inside the
Android Keystore with `setUserAuthenticationRequired` off but extraction
impossible. A save edited on disk, or copied from another device, fails
verification and is discarded instead of loaded. Writes go to a temp file and
are renamed, so a kill mid-write cannot leave a torn save.

**The save cannot be extracted or injected through backup.**
`allowBackup="false"`, plus explicit cloud-backup and device-transfer
exclusions for API 31+.

**The WebView is locked down.** In order of how much each one matters:

| Control | Why |
|---|---|
| Assets served from `https://appassets.androidplatform.net` | A real secure origin instead of `file://`, so storage works and CSP is enforceable |
| CSP sent as a response header: `default-src 'none'; script-src 'self'; connect-src 'none'` | No remote code, no inline script, no exfiltration path |
| `shouldOverrideUrlLoading` refuses every off-origin navigation | The page can never be replaced by something else |
| `shouldInterceptRequest` refuses every off-origin request | Nothing outside the APK is fetchable, even if CSP were bypassed |
| Per-segment path validation (`AssetOrigin.normalise`) | The only parser taking outside input; traversal, dotfiles, empty segments and odd characters all rejected |
| `setAllowFileAccess/ContentAccess/FileAccessFromFileURLs/UniversalAccessFromFileURLs` all false | No reach into the filesystem or other apps' content providers |
| `MIXED_CONTENT_NEVER_ALLOW`, no multiple windows, no auto-opened windows | Standard hardening |
| `X-Content-Type-Options: nosniff` with explicit MIME types | No content-type confusion |

**The JavaScript bridge is one object with four methods.** `NovaSave` exposes
`read`, `write`, `wipe` and `backend` — nothing reflective, nothing that takes
a path or a class name. `write` caps input at 512 KB and treats it as an opaque
blob. Since API 17 only `@JavascriptInterface`-annotated methods are reachable,
and CSP means no third-party script can ever run on the origin that can see it.

**No third-party runtime dependencies.** Zero libraries ship inside the APK —
no analytics SDK, no ad SDK, no CDN fetches, no fonts pulled at runtime. The
build-time surface is AGP and JUnit.

**Output encoding is consistent.** All dynamic text goes through `esc()` before
reaching `innerHTML`; the crash panel uses `textContent`. Item names are ours
today, but player-supplied names are coming and the discipline has to predate
them.

**The parser has tests.** `AssetOriginTest` covers traversal, encoded
separators, protocol-relative paths, dotfiles and character-set violations.
Run with `./gradlew test`.

## Known limitations — read before trusting this with money

- **Rolls happen on the client.** The HMAC makes the *stored* save
  tamper-evident; it does not make the game authoritative. Anyone who can run
  code in the process can call the Keystore to re-sign whatever they like. This
  is fine while the game is single-player and nothing is purchasable, and it is
  the first thing that must change before it is not.
- **`style-src 'unsafe-inline'`** is allowed because rarity tints are set as
  per-element custom properties. Scripts are not, which is the half that
  matters. Moving tints to generated classes would let us drop it.
- **Release builds use the debug signing key and R8 is off.** Both are
  deliberate for a prototype (installable, readable stack traces). Neither is
  acceptable for distribution — see below.

## Rules for what comes next

**Before the game goes online**

1. The server owns the roll. The client asks to summon; the server picks the
   result, debits the currency and returns it. The client never reports an
   outcome, only an intent.
2. Every economy mutation is an idempotent transaction with a client-supplied
   request id, so a retry cannot double-spend or double-grant.
3. Identity is a device-bound keypair, not a guessable id. Never a player id
   the client can simply assert.
4. Rate-limit per account and per device on the server. Assume the client is an
   attacker's script, because eventually it is.
5. Server-side audit log of every grant and spend, with enough detail to undo a
   bad release.
6. Secrets never enter the APK. Not API keys, not signing material, not admin
   endpoints. Anything shipped is public.
7. If in-app purchases arrive: validate receipts server-side against Google
   Play, never client-side.

**Before any public release**

- Generate a real upload keystore, keep it out of the repo (`.gitignore`
  already covers `*.jks`, `*.keystore`, `signing.properties`), and back it up
  somewhere losing the phone does not lose the key.
- Turn on R8 with `minifyEnabled true` and keep the mapping file.
- Re-check that no permission crept in.
- Write a privacy policy that matches reality; today's reality is that nothing
  leaves the device.

**For every new feature, before it merges**

- Does it add a permission, a network call, a dependency, or a bridge method?
  Each of those is a deliberate decision, documented here.
- Does it render anything the player or a server supplied? Then it goes through
  `esc()`.
- Does it trust a number the client produced? Then it is provisional until the
  server recomputes it.
- Does it add a parser? Then it gets tests like `AssetOriginTest` has.
