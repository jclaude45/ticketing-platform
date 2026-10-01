package com.ticketingplatform.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel

/**
 * Scanners built into PDA terminals: the code read with the trigger arrives as a broadcast
 * (the action and the extra depend on the brand) and is passed to Flutter. Terminals set
 * to type the code like a keyboard are handled on the Flutter side.
 */
class MainActivity : FlutterActivity() {
    private var receiver: BroadcastReceiver? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, "zcontrole/hardware_scanner")
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    configureZebraDataWedge()
                    val r = object : BroadcastReceiver() {
                        override fun onReceive(context: Context, intent: Intent) {
                            readCode(intent)?.let { events.success(it) }
                        }
                    }
                    val filter = IntentFilter().apply { ACTIONS.forEach { addAction(it) } }
                    // Sent by the scanner service, another app: the receiver has to be exported
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        registerReceiver(r, filter, Context.RECEIVER_EXPORTED)
                    } else {
                        registerReceiver(r, filter)
                    }
                    receiver = r
                }

                override fun onCancel(arguments: Any?) {
                    receiver?.let { runCatching { unregisterReceiver(it) } }
                    receiver = null
                }
            })
    }

    override fun onDestroy() {
        receiver?.let { runCatching { unregisterReceiver(it) } }
        receiver = null
        super.onDestroy()
    }

    private fun readCode(intent: Intent): String? {
        val extras = intent.extras ?: return null
        for (key in EXTRAS) {
            when (val value = extras.get(key)) {
                is String -> if (value.isNotBlank()) return value.trim()
                is ByteArray -> if (value.isNotEmpty()) return String(value, Charsets.UTF_8).trim()
            }
        }
        return null
    }

    /**
     * Zebra: DataWedge profile for this app sending the codes as a broadcast instead of
     * keystrokes. Created once; ignored on other terminals (nobody receives the intent).
     */
    private fun configureZebraDataWedge() {
        val intentPlugin = Bundle().apply {
            putString("PLUGIN_NAME", "INTENT")
            putString("RESET_CONFIG", "true")
            putBundle("PARAM_LIST", Bundle().apply {
                putString("intent_output_enabled", "true")
                putString("intent_action", ZEBRA_ACTION)
                putString("intent_delivery", "2") // broadcast
            })
        }
        val keystrokePlugin = Bundle().apply {
            putString("PLUGIN_NAME", "KEYSTROKE")
            putString("RESET_CONFIG", "true")
            putBundle("PARAM_LIST", Bundle().apply { putString("keystroke_output_enabled", "false") })
        }
        val profile = Bundle().apply {
            putString("PROFILE_NAME", "zcontrole")
            putString("PROFILE_ENABLED", "true")
            putString("CONFIG_MODE", "CREATE_IF_NOT_EXIST")
            putParcelableArray("APP_LIST", arrayOf(Bundle().apply {
                putString("PACKAGE_NAME", packageName)
                putStringArray("ACTIVITY_LIST", arrayOf("*"))
            }))
            putParcelableArrayList("PLUGIN_CONFIG", arrayListOf(intentPlugin, keystrokePlugin))
        }
        runCatching {
            sendBroadcast(Intent("com.symbol.datawedge.api.ACTION").putExtra("com.symbol.datawedge.api.SET_CONFIG", profile))
        }
    }

    companion object {
        private const val ZEBRA_ACTION = "live.zaya.zcontrole.SCAN"

        /** Broadcasts of the common PDA brands (scanner set to "broadcast" / "intent" output) */
        private val ACTIONS = listOf(
            ZEBRA_ACTION,                                   // Zebra (DataWedge profile above)
            "com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED",  // Sunmi
            "android.intent.ACTION_DECODE_DATA",            // Urovo
            "nlscan.action.SCANNER_RESULT",                 // Newland
            "android.intent.action.SCANRESULT",             // iData, Kaicom
            "com.scanner.broadcast",                        // Chainway
            "com.android.server.scannerservice.broadcast",  // Seuic
            "device.scanner.EVENT",                         // Point Mobile
            "scan.rcv.message",                             // various (Mobilebase, ...)
        )

        /** Where each brand puts the code, tried in this order */
        private val EXTRAS = listOf(
            "com.symbol.datawedge.data_string",
            "data",
            "barcode_string",
            "SCAN_BARCODE1",
            "value",
            "scannerdata",
            "EXTRA_EVENT_DECODE_VALUE",
            "barcodeData",
            "barcode",
            "decode_rslt",
        )
    }
}
