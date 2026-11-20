package de.ghostnode.vrcnexus;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** Startet die WebView-App und meldet die Plugins an (Homescreen-Widget, OSC über UDP). */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class);
        registerPlugin(OscBridge.class);
        super.onCreate(savedInstanceState);
    }
}
