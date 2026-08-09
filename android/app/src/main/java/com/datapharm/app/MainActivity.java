package com.datapharm.app;

import android.os.Bundle;
import android.graphics.Color;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.capacitorjs.plugins.statusbar.StatusBarPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppSettingsPlugin.class);
        registerPlugin(MediaPermissionsPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(StatusBarPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#161C24"));
    }
}