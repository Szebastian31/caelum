package com.caelum.sky;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Caelum's whole interface is the web app, bundled in the APK. This activity hosts it edge to edge and
 * gives it what a browser can't: opening the phone's own camera app (with its Night mode), saving
 * photos to the gallery, and keeping the screen awake while you stargaze.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final String NIGHT = "#070d26";
    private static final int REQ_LOC = 7, REQ_CAM = 8;

    private WebView web;
    private GeolocationPermissions.Callback geoCb;
    private String geoOrigin;
    private PermissionRequest camReq;
    // status and navigation bar heights in CSS pixels, handed to the page as --sat / --sab
    private int insetTop, insetBottom;
    // dark bar icons for the light Atlas and Glacier skins
    private boolean lightBars;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // If Caelum crashed last time, show what happened instead of crashing again, so it can be sent on.
        final File crash = new File(getFilesDir(), "crash.txt");
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((th, e) -> {
            try (FileOutputStream o = new FileOutputStream(crash)) {
                java.io.StringWriter sw = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(sw, true));
                o.write((header() + sw).getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) {}
            if (prev != null) prev.uncaughtException(th, e);
        });
        if (crash.exists()) { showCrash(crash); return; }

        // stargazing means looking at the screen without touching it for a while
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor(NIGHT));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(NIGHT));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // only after setContentView: ColorOS crashes if the bars are touched before the window has its decor view
        try { edgeToEdge(); } catch (Exception ignored) {}

        // the sky draws under the status and navigation bars; the page pads its buttons with --sat / --sab
        root.setOnApplyWindowInsetsListener((v, ins) -> {
            try {
                int top, bottom;
                if (Build.VERSION.SDK_INT >= 30) {
                    Insets bars = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = bars.top;
                    bottom = bars.bottom;
                } else {
                    top = ins.getSystemWindowInsetTop();
                    bottom = ins.getSystemWindowInsetBottom();
                }
                float d = getResources().getDisplayMetrics().density;
                insetTop = Math.round(top / d);
                insetBottom = Math.round(bottom / d);
                pushInsets();
            } catch (Exception ignored) {}
            return ins;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // so the camera preview starts without an extra tap
        s.setAllowFileAccess(false);
        s.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pushInsets();
            }

            // If the page's renderer dies, Android closes the whole app unless it's handled here, and no Java
            // error is raised, so the crash screen would never see it. Write it down and show it instead.
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                try (FileOutputStream o = new FileOutputStream(crash)) {
                    String why = detail.didCrash() ? "The WebView's page renderer crashed." : "The system stopped the WebView's page renderer (usually to free memory).";
                    o.write((header() + why + "\n").getBytes(StandardCharsets.UTF_8));
                } catch (Exception ignored) {}
                if (web == view && web != null) {
                    try { ((android.view.ViewGroup) web.getParent()).removeView(web); } catch (Exception ignored) {}
                    web.destroy();
                    web = null;
                }
                recreate();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // "Use my location"
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                    cb.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCb = cb;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
                }
            }

            // Caelum's own night camera
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                boolean wantsCamera = false;
                for (String r : req.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                if (!wantsCamera) { req.deny(); return; }
                if (has(Manifest.permission.CAMERA)) {
                    req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    camReq = req;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
                }
            }
        });
        web.addJavascriptInterface(new Bridge(), "CaelumNative");

        // Android 16 no longer calls onBackPressed for apps targeting it; back arrives here instead
        if (Build.VERSION.SDK_INT >= 33) try {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        } catch (Exception ignored) {}

        web.loadUrl(START);
    }

    private String header() {
        return "Caelum " + appVersion() + " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") · "
                + Build.MANUFACTURER + " " + Build.MODEL + "\n\n";
    }

    private String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    /** What went wrong last time, with Share (to send it on) and Try again. Plain Android views only, nothing that could fail the same way. */
    private void showCrash(File crash) {
        String text;
        try { text = new String(java.nio.file.Files.readAllBytes(crash.toPath()), StandardCharsets.UTF_8); }
        catch (Exception e) { text = "(the error report couldn't be read)"; }
        final String report = text;
        float d = getResources().getDisplayMetrics().density;
        int pad = Math.round(20 * d);

        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor(NIGHT));
        box.setPadding(pad, Math.round(56 * d), pad, Math.round(32 * d));

        android.widget.TextView title = new android.widget.TextView(this);
        title.setText("Caelum stopped last time");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        box.addView(title);

        android.widget.TextView lead = new android.widget.TextView(this);
        lead.setText("Tap Share and send this to whoever is fixing the app, then Try again.");
        lead.setTextColor(Color.parseColor("#B9C6EE"));
        lead.setTextSize(15);
        lead.setPadding(0, Math.round(8 * d), 0, Math.round(14 * d));
        box.addView(lead);

        android.widget.LinearLayout row = new android.widget.LinearLayout(this);
        android.widget.Button share = new android.widget.Button(this);
        share.setText("Share");
        share.setOnClickListener(v -> {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, report);
            try { startActivity(Intent.createChooser(i, "Share")); } catch (Exception ignored) {}
        });
        android.widget.Button again = new android.widget.Button(this);
        again.setText("Try again");
        again.setOnClickListener(v -> { crash.delete(); recreate(); });
        row.addView(share);
        row.addView(again);
        box.addView(row);

        android.widget.TextView log = new android.widget.TextView(this);
        log.setText(report);
        log.setTextColor(Color.parseColor("#E2E8F8"));
        log.setTextSize(11);
        log.setTypeface(android.graphics.Typeface.MONOSPACE);
        log.setTextIsSelectable(true);
        log.setPadding(0, Math.round(14 * d), 0, 0);
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.addView(log);
        box.addView(scroll, new android.widget.LinearLayout.LayoutParams(-1, 0, 1f));
        setContentView(box);
    }

    @SuppressWarnings("deprecation")
    private void edgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().setStatusBarContrastEnforced(false);
        getWindow().setNavigationBarContrastEnforced(false);
        getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        applyBars();
    }

    @SuppressWarnings("deprecation")
    private void applyBars() {
        try {
            View decor = getWindow().getDecorView();
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController c = decor.getWindowInsetsController();
                if (c == null) return;
                int both = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(lightBars ? both : 0, both);
            } else {
                int f = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                if (lightBars) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                decor.setSystemUiVisibility(f);
            }
        } catch (Exception ignored) {}
    }

    private void pushInsets() {
        if (web == null) return;
        web.evaluateJavascript("(function(s){s.setProperty('--sat','" + insetTop + "px');s.setProperty('--sab','" + insetBottom + "px')})(document.documentElement.style)", null);
    }

    private boolean has(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        boolean ok = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
        if (req == REQ_LOC && geoCb != null) {
            geoCb.invoke(geoOrigin, ok, false);
            geoCb = null;
        } else if (req == REQ_CAM && camReq != null) {
            if (ok) camReq.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else camReq.deny();
            camReq = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    /** Back (Android 12 and older; 13+ uses the callback registered in onCreate) */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goBack();
    }

    /** Lets the page close the camera, a sheet or a tab first; otherwise Caelum goes to the background. */
    private void goBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.caelumBack?caelumBack():false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    /** Every way of opening the phone's camera app, best first. */
    private List<Intent> cameraIntents() {
        PackageManager pm = getPackageManager();
        List<Intent> list = new ArrayList<>();
        // the standard "open the camera app" request: the full app, every mode, as if you'd tapped its icon
        list.add(new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA));
        // the camera app's own launcher entry (Oppo/OnePlus/Realme first), in case the above isn't answered
        String[] known = {"com.oplus.camera", "com.oppo.camera", "com.android.camera", "com.android.camera2",
                "com.google.android.GoogleCamera", "com.sec.android.app.camera", "com.motorola.camera3"};
        for (String pkg : known) {
            Intent l = pm.getLaunchIntentForPackage(pkg);
            if (l != null) list.add(l);
        }
        try {
            ResolveInfo ri = pm.resolveActivity(new Intent(MediaStore.ACTION_IMAGE_CAPTURE), PackageManager.MATCH_DEFAULT_ONLY);
            if (ri != null && ri.activityInfo != null && !"android".equals(ri.activityInfo.packageName)) {
                Intent l = pm.getLaunchIntentForPackage(ri.activityInfo.packageName);
                if (l != null) list.add(l);
            }
        } catch (Exception ignored) {}
        // last resort: the camera's simple "take one photo" screen
        list.add(new Intent(MediaStore.ACTION_IMAGE_CAPTURE));
        return list;
    }

    /** Everything the web app can ask Android for, as window.CaelumNative. */
    private class Bridge {
        /** Opens the phone's camera app. If nothing opens, the page is told so it can use Caelum's own camera. */
        @JavascriptInterface
        public void openCamera() {
            final List<Intent> tries = cameraIntents();
            runOnUiThread(() -> {
                for (Intent i : tries) {
                    try {
                        startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                        return;
                    } catch (ActivityNotFoundException | SecurityException e) {
                        // try the next way
                    } catch (Exception e) {
                        // try the next way
                    }
                }
                js("window.caelumCameraFailed&&caelumCameraFailed()");
            });
        }

        /** Saves a JPEG (base64) to Pictures/Caelum so it shows up in the gallery. */
        @JavascriptInterface
        public boolean savePhoto(String base64, String name) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Caelum");
                v.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                try (OutputStream os = cr.openOutputStream(uri)) {
                    if (os == null) return false;
                    os.write(bytes);
                }
                v.clear();
                v.put(MediaStore.Images.Media.IS_PENDING, 0);
                cr.update(uri, v, null, null);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Same patterns as navigator.vibrate: "18" or "18,40,18" (vibrate, pause, vibrate…). */
        @JavascriptInterface
        public void vibrate(String csv) {
            Vibrator vib = getSystemService(Vibrator.class);
            if (vib == null || !vib.hasVibrator()) return;
            try {
                String[] parts = csv.split(",");
                if (parts.length == 1) {
                    vib.vibrate(VibrationEffect.createOneShot(Math.max(1, Long.parseLong(parts[0].trim())), VibrationEffect.DEFAULT_AMPLITUDE));
                    return;
                }
                long[] pattern = new long[parts.length + 1];
                for (int k = 0; k < parts.length; k++) pattern[k + 1] = Long.parseLong(parts[k].trim());
                vib.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } catch (Exception ignored) {
            }
        }

        /** Dark status and navigation bar icons (true) for the light skins, light icons (false) otherwise. */
        @JavascriptInterface
        public void setBars(boolean light) {
            if (light == lightBars) return;
            runOnUiThread(() -> { lightBars = light; applyBars(); });
        }

        @JavascriptInterface
        public String version() {
            return appVersion();
        }
    }
}
