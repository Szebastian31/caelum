package com.caelum.sky;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;

/**
 * Caelum's whole interface is the web app, bundled in the APK. This activity hosts it full screen and
 * gives it what a browser can't: opening the phone's own camera app (with its Night mode), saving
 * photos to the gallery, and keeping the screen awake while you stargaze.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int REQ_LOC = 7, REQ_CAM = 8;

    private WebView web;
    private GeolocationPermissions.Callback geoCb;
    private String geoOrigin;
    private PermissionRequest camReq;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("#070d26"));
        getWindow().setNavigationBarColor(Color.parseColor("#070d26"));
        // stargazing means looking at the screen without touching it for a while
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070d26"));
        setContentView(web);

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

            // the in-app night camera
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
        web.loadUrl(START);
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
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.caelumBack?caelumBack():false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    private void toast(String msg) {
        runOnUiThread(() -> web.evaluateJavascript("window.toast&&toast(" + org.json.JSONObject.quote(msg) + ")", null));
    }

    /** Everything the web app can ask Android for, as window.CaelumNative. */
    private class Bridge {
        /**
         * Opens the phone's full camera app, exactly as if you'd tapped its icon, so every mode (including Night) is there.
         * Returns false only if no camera app could be found, so the web app can fall back to its own camera.
         */
        @JavascriptInterface
        public boolean openCamera() {
            PackageManager pm = getPackageManager();
            Intent launch = null;

            // 1. the system camera app's own launcher (Oppo/OnePlus/Realme first, then whatever handles photos)
            String[] known = {"com.oplus.camera", "com.oppo.camera", "com.android.camera", "com.android.camera2",
                    "com.google.android.GoogleCamera", "com.sec.android.app.camera", "com.motorola.camera3"};
            for (String pkg : known) {
                launch = pm.getLaunchIntentForPackage(pkg);
                if (launch != null) break;
            }
            if (launch == null) {
                ResolveInfo ri = pm.resolveActivity(new Intent(MediaStore.ACTION_IMAGE_CAPTURE), PackageManager.MATCH_DEFAULT_ONLY);
                if (ri != null && ri.activityInfo != null && !"android".equals(ri.activityInfo.packageName)) {
                    launch = pm.getLaunchIntentForPackage(ri.activityInfo.packageName);
                }
            }
            // 2. the standard "open the camera" intents
            if (launch == null) {
                Intent still = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                if (still.resolveActivity(pm) != null) launch = still;
            }
            if (launch == null) {
                Intent cap = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (cap.resolveActivity(pm) != null) launch = cap;
            }
            if (launch == null) return false;

            final Intent go = launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> {
                try {
                    startActivity(go);
                } catch (Exception e) {
                    toast("Couldn't open the camera app");
                }
            });
            return true;
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

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
