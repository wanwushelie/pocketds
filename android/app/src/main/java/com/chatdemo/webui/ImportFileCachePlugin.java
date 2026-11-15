package com.chatdemo.webui;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;

/**
 * 大文件历史导入的原生通道：
 * - pickAndCache：系统文件选择器选 ZIP，把 content:// 流整段拷进应用沙箱成真实文件，
 *   交给网页一个普通文件路径（WebView 文件选择器给的管道文件随机访问是 O(n²)）。
 * - readRange：网页按 (offset, length) 随机读沙箱文件，返回 base64。
 * - release：导入结束后删除缓存文件。
 */
@CapacitorPlugin(name = "ImportFileCache")
public class ImportFileCachePlugin extends Plugin {

    private static final String CACHE_DIR = "import-cache";
    private static final int COPY_BUFFER_BYTES = 1024 * 1024;

    @PluginMethod
    public void pickAndCache(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            new String[] {"application/zip", "application/x-zip-compressed", "application/octet-stream"}
        );
        startActivityForResult(call, intent, "onPicked");
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return; // 页面已销毁，丢弃结果
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
                || result.getData().getData() == null) {
            call.resolve(); // 用户取消
            return;
        }
        try {
            Uri uri = result.getData().getData();
            Context context = getContext();
            String name = queryDisplayName(context, uri);
            if (name == null || name.isEmpty()) {
                name = "history.zip";
            }
            name = name.replaceAll("[/\\\\]", "_");

            File dir = new File(context.getFilesDir(), CACHE_DIR);
            // 清理上次导入中断遗留的缓存
            File[] leftovers = dir.listFiles();
            if (leftovers != null) {
                for (File leftover : leftovers) {
                    //noinspection ResultOfMethodCallIgnored
                    leftover.delete();
                }
            }
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File dest = new File(dir, name);

            ContentResolver resolver = context.getContentResolver();
            long total = 0;
            try (InputStream in = resolver.openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(dest)) {
                if (in == null) {
                    call.reject("unable to open selected file");
                    return;
                }
                byte[] buffer = new byte[COPY_BUFFER_BYTES];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    total += read;
                }
            }

            JSObject ret = new JSObject();
            ret.put("path", dest.getAbsolutePath());
            ret.put("name", name);
            ret.put("size", total);
            android.util.Log.d("ImportFileCache", "pickAndCache resolve: path=" + ret.getString("path")
                + " name=" + ret.getString("name") + " size=" + total);
            call.resolve(ret);
        } catch (IOException | SecurityException error) {
            android.util.Log.w("ImportFileCache", "pickAndCache reject", error);
            call.reject("copy selected file failed", error);
        }
    }

    @PluginMethod
    public void readRange(PluginCall call) {
        String path = call.getString("path");
        int offset = call.getInt("offset", -1);
        int length = call.getInt("length", -1);
        if (path == null || offset < 0 || length < 0) {
            // length 允许为 0：ZIP 目录解析会对无扩展字段的条目做零长度读取
            call.reject("invalid readRange arguments");
            return;
        }
        android.util.Log.d("ImportFileCache", "readRange: path=" + path + " offset=" + offset + " length=" + length);
        File file = new File(path);
        long fileLength = file.length();
        if (offset > fileLength || offset + length > fileLength) {
            call.reject("readRange out of bounds: " + offset + "+" + length + "/" + fileLength);
            return;
        }
        try (RandomAccessFile randomAccess = new RandomAccessFile(file, "r")) {
            byte[] bytes = new byte[length];
            randomAccess.seek(offset);
            randomAccess.readFully(bytes);
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (IOException error) {
            call.reject("readRange failed", error);
        }
    }

    @PluginMethod
    public void release(PluginCall call) {
        String path = call.getString("path");
        if (path != null) {
            File file = new File(path);
            // 只允许删除本插件的缓存目录内容，防止误删任意路径
            File cacheDir = new File(getContext().getFilesDir(), CACHE_DIR);
            if (!file.getAbsolutePath().startsWith(cacheDir.getAbsolutePath())) {
                call.reject("path outside import cache dir");
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
        call.resolve();
    }

    private String queryDisplayName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver()
                .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    return cursor.getString(index);
                }
            }
        }
        return null;
    }
}
