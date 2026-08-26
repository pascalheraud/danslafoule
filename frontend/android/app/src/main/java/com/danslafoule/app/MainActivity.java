package com.danslafoule.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Required by @capacitor-community/safe-area for env(safe-area-inset-*)
        // to report real values under Android 15's enforced edge-to-edge mode
        // (targetSdkVersion 35) — without this, content can be drawn behind the
        // status bar/camera cutout/gesture nav while the CSS insets stay 0.
        EdgeToEdge.enable(this);
    }
}
