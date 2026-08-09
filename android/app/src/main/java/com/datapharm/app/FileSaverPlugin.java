package com.datapharm.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Exports files through Android's Storage Access Framework.
 *
 * Launches the system "Save to…" dialog (ACTION_CREATE_DOCUMENT) so the user
 * picks exactly where the report goes (Downloads, Drive, any folder). Needs no
 * storage permission on any Android version, because the picked location is
 * granted to the app by the system.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private PluginCall pendingCall;
    private byte[] pendingData;

    @PluginMethod
    public void saveFile(PluginCall call) {
        String base64 = call.getString("base64");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType");
        if (base64 == null || filename == null) {
            call.reject("base64 and filename are required");
            return;
        }
        if (pendingCall != null) {
            call.reject("A save dialog is already open");
            return;
        }
        try {
            pendingData = Base64.decode(base64, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Could not decode file data", e);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        pendingCall = call;
        startActivityForResult(call, intent, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        pendingCall = null;
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            try (OutputStream os = getContext().getContentResolver().openOutputStream(uri, "w");
                 InputStream is = new ByteArrayInputStream(pendingData)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
                pendingData = null;
                JSObject ret = new JSObject();
                ret.put("status", "saved");
                call.resolve(ret);
            } catch (Exception e) {
                pendingData = null;
                call.reject("Could not write the file", e);
            }
        } else {
            pendingData = null;
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            call.resolve(ret);
        }
    }
}
