package com.datapharm.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Media + file permissions.
 *
 * - "Photos & videos": READ_MEDIA_IMAGES + READ_MEDIA_VIDEO on Android 13+
 *   (API 33+); READ_EXTERNAL_STORAGE on Android 12 and below.
 * - "Files & media": READ/WRITE_EXTERNAL_STORAGE on Android 12 and below. On
 *   Android 13+ there is no blanket file permission — apps use the system
 *   document picker (SAF), so this resolves as 'system' (managed by Android).
 */
@CapacitorPlugin(
    name = "MediaPermissions",
    permissions = {
        @Permission(alias = "photos33", strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "legacyRead", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "legacyReadWrite", strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }),
    }
)
public class MediaPermissionsPlugin extends Plugin {

    private boolean granted(String perm) {
        return getContext().checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    private String status(String[] perms) {
        boolean all = true;
        for (String p : perms) {
            if (!granted(p)) {
                all = false;
                break;
            }
        }
        if (all) return "granted";
        // If the user previously denied one of them, report 'denied' so the UI
        // can explain and offer "Open Settings".
        for (String p : perms) {
            if (getActivity().shouldShowRequestPermissionRationale(p)) return "denied";
        }
        return "prompt";
    }

    private JSObject snapshot() {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= 33) {
            ret.put("files", "system"); // no blanket file permission exists on 13+
        } else {
            String[] filePerms = Build.VERSION.SDK_INT >= 29
                ? new String[]{ Manifest.permission.READ_EXTERNAL_STORAGE }
                : new String[]{ Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE };
            ret.put("files", status(filePerms));
        }
        String[] photoPerms = Build.VERSION.SDK_INT >= 33
            ? new String[]{ Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO }
            : new String[]{ Manifest.permission.READ_EXTERNAL_STORAGE };
        ret.put("photos", status(photoPerms));
        return ret;
    }

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(snapshot());
    }

    @PluginMethod
    public void requestPhotos(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("photos33", call, "photosResult");
        } else {
            requestPermissionForAlias("legacyRead", call, "photosResult");
        }
    }

    @PermissionCallback
    private void photosResult(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT >= 33
            ? granted(Manifest.permission.READ_MEDIA_IMAGES) && granted(Manifest.permission.READ_MEDIA_VIDEO)
            : granted(Manifest.permission.READ_EXTERNAL_STORAGE);
        JSObject ret = new JSObject();
        ret.put("status", granted ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestFiles(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            // Nothing to ask on modern Android — file access flows through the
            // system document picker. Report as system-managed.
            JSObject ret = new JSObject();
            ret.put("status", "system");
            call.resolve(ret);
        } else if (Build.VERSION.SDK_INT >= 29) {
            requestPermissionForAlias("legacyRead", call, "filesResult");
        } else {
            requestPermissionForAlias("legacyReadWrite", call, "filesResult");
        }
    }

    @PermissionCallback
    private void filesResult(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT >= 29
            ? granted(Manifest.permission.READ_EXTERNAL_STORAGE)
            : granted(Manifest.permission.READ_EXTERNAL_STORAGE) && granted(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        JSObject ret = new JSObject();
        ret.put("status", granted ? "granted" : "denied");
        call.resolve(ret);
    }
}
