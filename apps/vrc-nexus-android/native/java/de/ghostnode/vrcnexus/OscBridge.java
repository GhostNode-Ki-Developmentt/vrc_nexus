package de.ghostnode.vrcnexus;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * OSC für die Handy-App (3.2.5): nur rohes UDP – Senden an VRChat (PC-IP:9000) und Empfangen der Avatar-Parameter (Port 9001).
 * Kodieren/Dekodieren der OSC-Nachrichten macht der JavaScript-Teil (backend/gamelog.js), hier gehen nur Bytes (Base64) hin und her.
 * Nur Adressen im eigenen Netz (privat/lokal) – kein Versand ins Internet.
 */
@CapacitorPlugin(name = "OscBridge")
public class OscBridge extends Plugin {
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private DatagramSocket sendSock;
    private DatagramSocket recvSock;
    private Thread recvThread;

    private static boolean local(InetAddress a) {
        return a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress();
    }

    @PluginMethod
    public void send(PluginCall call) {
        final String host = call.getString("host", "");
        final int port = call.getInt("port", 9000);
        final String data = call.getString("data", "");
        sender.execute(() -> {
            try {
                InetAddress addr = InetAddress.getByName(host);
                if (!local(addr)) { call.reject("Nur Adressen im eigenen Netz erlaubt."); return; }
                if (port < 1 || port > 65535) { call.reject("Ungültiger Port."); return; }
                byte[] buf = Base64.decode(data, Base64.NO_WRAP);
                synchronized (this) { if (sendSock == null || sendSock.isClosed()) sendSock = new DatagramSocket(); }
                sendSock.send(new DatagramPacket(buf, buf.length, addr, port));
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Senden fehlgeschlagen." : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void listen(PluginCall call) {
        final int port = call.getInt("port", 9001);
        stopRecv();
        try {
            DatagramSocket s = new DatagramSocket(null);
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(port));
            recvSock = s;
        } catch (Exception e) {
            call.reject("Port " + port + " lässt sich nicht öffnen: " + e.getMessage());
            return;
        }
        final DatagramSocket s = recvSock;
        recvThread = new Thread(() -> {
            byte[] buf = new byte[65535];
            while (!s.isClosed()) {
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    if (!local(p.getAddress())) continue;
                    JSObject o = new JSObject();
                    o.put("data", Base64.encodeToString(p.getData(), p.getOffset(), p.getLength(), Base64.NO_WRAP));
                    o.put("host", p.getAddress().getHostAddress());
                    o.put("port", p.getPort());
                    notifyListeners("packet", o);
                } catch (Exception e) {
                    if (s.isClosed()) break;
                }
            }
        }, "osc-recv");
        recvThread.setDaemon(true);
        recvThread.start();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopRecv();
        call.resolve();
    }

    /** Eigene IPv4-Adressen im WLAN – für den Hinweis „VRChat an diese Adresse senden lassen“. */
    @PluginMethod
    public void info(PluginCall call) {
        JSArray ips = new JSArray();
        try {
            for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!n.isUp() || n.isLoopback()) continue;
                for (InetAddress a : Collections.list(n.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) ips.put(a.getHostAddress());
                }
            }
        } catch (Exception e) { /* keine Adresse */ }
        JSObject o = new JSObject();
        o.put("ips", ips);
        o.put("listening", recvSock != null && !recvSock.isClosed());
        call.resolve(o);
    }

    private void stopRecv() {
        if (recvSock != null) { try { recvSock.close(); } catch (Exception e) { /* egal */ } recvSock = null; }
        recvThread = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopRecv();
        if (sendSock != null) sendSock.close();
        sender.shutdownNow();
    }
}
