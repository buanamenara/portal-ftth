package id.co.buanamenara.portalftth;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

/**
 * Pembungkus Android untuk FTTH Project Control Portal (buanamenara.github.io/portal-ftth).
 * Halaman web tetap dimuat dari internet; aplikasi ini hanya menampilkannya layar penuh
 * dan menangani unggah file/foto, unduhan, serta tautan ke aplikasi lain (WhatsApp, Sheets).
 */
public class MainActivity extends Activity {
    static final String HOME = "https://buanamenara.github.io/portal-ftth/";
    static final int REQ_FILE = 1001;

    WebView web;
    ProgressBar bar;
    ValueCallback<Uri[]> fileCb;
    Uri cameraUri;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.BLACK);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0xFB, 0xF7, 0xEE));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setIndeterminate(false);
        int h = (int) (3 * getResources().getDisplayMetrics().density);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUserAgentString(s.getUserAgentString() + " PortalFTTH-Android/1.0");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "BMIApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(new Downloads());

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // Halaman yang tetap dibuka di dalam aplikasi; selain ini dibuka di aplikasi lain.
    static boolean internal(Uri u) {
        String scheme = u.getScheme(), host = u.getHost();
        if (host == null || !("https".equals(scheme) || "http".equals(scheme))) return false;
        if (host.equals("buanamenara.github.io")) return true;
        if (host.equals("script.google.com") || host.endsWith(".googleusercontent.com")) return true;
        return host.equals("accounts.google.com");
    }

    boolean route(String url) {
        Uri u = Uri.parse(url);
        if (internal(u)) return false;
        openExternal(url);
        return true;
    }

    void openExternal(String url) {
        try {
            Intent i;
            if (url.startsWith("intent:")) {
                i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    String fb = i.getStringExtra("browser_fallback_url");
                    if (fb != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fb)));
                }
                return;
            }
            i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) {
            toast("Tidak ada aplikasi untuk membuka tautan ini");
        }
    }

    void toast(final String msg) {
        runOnUiThread(new Runnable() {
            public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show(); }
        });
    }

    class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            return route(r.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView v, String url) {
            return route(url);
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (!r.isForMainFrame()) return;
            String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>body{font-family:sans-serif;background:#FBF7EE;color:#222;text-align:center;padding:48px 24px}"
                + "a{display:inline-block;margin-top:20px;padding:12px 28px;background:#000;color:#D4A23A;border-radius:8px;text-decoration:none;font-weight:bold}</style></head>"
                + "<body><h2>Tidak ada koneksi internet</h2><p>Portal FTTH membutuhkan internet. Periksa data seluler atau Wi-Fi, lalu coba lagi.</p>"
                + "<a href='" + HOME + "'>Coba lagi</a></body></html>";
            v.loadDataWithBaseURL(HOME, html, "text/html", "utf-8", null);
        }
    }

    class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView v, int p) {
            bar.setProgress(p);
            bar.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
        }

        // Tautan target=_blank / window.open: ambil alamatnya lalu buka di aplikasi yang sesuai.
        @Override
        public boolean onCreateWindow(WebView v, boolean dialog, boolean userGesture, Message msg) {
            final WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                boolean done;

                void take(String url) {
                    if (done || url == null || url.equals("about:blank")) return;
                    done = true;
                    Uri u = Uri.parse(url);
                    if ("buanamenara.github.io".equals(u.getHost())) web.loadUrl(url);
                    else openExternal(url);
                    tmp.post(new Runnable() { public void run() { tmp.destroy(); } });
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView v2, WebResourceRequest r) {
                    take(r.getUrl().toString());
                    return true;
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView v2, String url) {
                    take(url);
                    return true;
                }

                @Override
                public void onPageStarted(WebView v2, String url, android.graphics.Bitmap icon) {
                    take(url);
                    v2.stopLoading();
                }
            });
            WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
            t.setWebView(tmp);
            msg.sendToTarget();
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            cameraUri = null;

            ArrayList<String> mimes = new ArrayList<String>();
            boolean image = false;
            String[] acc = p.getAcceptTypes();
            if (acc != null) {
                for (String a0 : acc) {
                    if (a0 == null) continue;
                    for (String a : a0.split(",")) {
                        a = a.trim().toLowerCase(Locale.ROOT);
                        if (a.isEmpty()) continue;
                        if (a.startsWith(".")) {
                            String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(a.substring(1));
                            if (m == null && a.equals(".xlsx")) m = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                            if (m == null && a.equals(".xls")) m = "application/vnd.ms-excel";
                            if (m == null && a.equals(".csv")) m = "text/csv";
                            if (m == null && a.equals(".zip")) m = "application/zip";
                            a = m;
                        }
                        if (a == null) continue;
                        if (a.startsWith("image/")) image = true;
                        if (!mimes.contains(a)) mimes.add(a);
                    }
                }
            }
            if (mimes.isEmpty()) image = true;

            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (mimes.size() == 1) pick.setType(mimes.get(0));
            else {
                pick.setType("*/*");
                if (!mimes.isEmpty()) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
            }
            if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            Intent cam = null;
            if (image && Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentValues cv = new ContentValues();
                    String name = "PortalFTTH_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + ".jpg";
                    cv.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                    cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Portal FTTH");
                    cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                    if (cameraUri != null) {
                        cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                } catch (Exception e) {
                    cameraUri = null;
                    cam = null;
                }
            }

            Intent go;
            if (cam != null && p.isCaptureEnabled()) go = cam;
            else {
                go = Intent.createChooser(pick, "Pilih file");
                if (cam != null) go.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
            }
            try {
                startActivityForResult(go, REQ_FILE);
            } catch (Exception e) {
                dropCamera();
                fileCb = null;
                toast("Tidak bisa membuka pemilih file");
                return false;
            }
            return true;
        }
    }

    void dropCamera() {
        if (cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) { }
            cameraUri = null;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_FILE) {
            super.onActivityResult(req, res, data);
            return;
        }
        Uri[] out = null;
        if (res == RESULT_OK) {
            ArrayList<Uri> list = new ArrayList<Uri>();
            if (data != null && data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri u = data.getClipData().getItemAt(i).getUri();
                    if (u != null) list.add(u);
                }
            } else if (data != null && data.getData() != null) {
                list.add(data.getData());
            }
            if (list.isEmpty() && cameraUri != null && cameraHasPhoto()) {
                list.add(cameraUri);
                cameraUri = null;
            }
            if (!list.isEmpty()) out = list.toArray(new Uri[0]);
        }
        dropCamera();
        if (fileCb != null) fileCb.onReceiveValue(out);
        fileCb = null;
    }

    boolean cameraHasPhoto() {
        try {
            android.content.res.AssetFileDescriptor fd = getContentResolver().openAssetFileDescriptor(cameraUri, "r");
            long len = fd == null ? 0 : fd.getLength();
            if (fd != null) fd.close();
            return len != 0;
        } catch (Exception e) {
            return false;
        }
    }

    class Downloads implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                toast("File ini belum bisa diunduh dari aplikasi. Buka portal di Chrome untuk mengunduhnya.");
                return;
            }
            try {
                String name = URLUtil.guessFileName(url, cd, mime);
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) r.addRequestHeader("Cookie", cookie);
                r.addRequestHeader("User-Agent", ua);
                r.setMimeType(mime);
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                toast("Mengunduh " + name + " ke folder Download");
            } catch (Exception e) {
                openExternal(url);
            }
        }
    }

    // Dipanggil portal (window.BMIApp) untuk menyimpan file yang dibuat di halaman (PDF/Excel/ZIP).
    class Bridge {
        @JavascriptInterface
        public boolean isApp() { return true; }

        @JavascriptInterface
        public boolean saveBase64(String b64, String name, String mime) {
            try {
                int comma = b64.indexOf(',');
                if (b64.startsWith("data:") && comma > 0) b64 = b64.substring(comma + 1);
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                if (name == null || name.trim().isEmpty()) name = "PortalFTTH_" + System.currentTimeMillis();
                name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (mime == null || mime.isEmpty()) {
                    String ext = MimeTypeMap.getFileExtensionFromUrl(name);
                    mime = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(Locale.ROOT));
                    if (mime == null) mime = "application/octet-stream";
                }
                final Uri uri;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContentResolver();
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Portal FTTH");
                    uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new Exception("insert");
                    OutputStream os = cr.openOutputStream(uri);
                    os.write(bytes);
                    os.close();
                    toast("Tersimpan di Download/Portal FTTH: " + name);
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, name);
                    FileOutputStream os = new FileOutputStream(f);
                    os.write(bytes);
                    os.close();
                    uri = null;
                    toast("Tersimpan: " + f.getAbsolutePath());
                }
                if (uri != null) {
                    final String m = mime;
                    runOnUiThread(new Runnable() {
                        public void run() {
                            try {
                                Intent i = new Intent(Intent.ACTION_VIEW);
                                i.setDataAndType(uri, m);
                                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                startActivity(i);
                            } catch (Exception ignored) { }
                        }
                    });
                }
                return true;
            } catch (Exception e) {
                toast("Gagal menyimpan file: " + e.getMessage());
                return false;
            }
        }
    }
}
