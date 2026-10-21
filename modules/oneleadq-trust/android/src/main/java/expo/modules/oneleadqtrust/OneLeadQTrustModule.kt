package expo.modules.oneleadqtrust

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URL
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.security.spec.ECGenParameterSpec
import java.util.Collections
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import org.json.JSONObject

class OneLeadQTrustModule : Module() {
  private val lock = Any()
  private val context: Context get() = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
  private fun store(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private fun alias(gatewayId: String): String {
    require(gatewayId.matches(Regex("[a-fA-F0-9-]{36}"))) { "Invalid gateway identity" }
    return "oneleadq-device-$gatewayId"
  }
  private fun identity(gatewayId: String): String = synchronized(lock) {
    val name = alias(gatewayId)
    if (!store().containsAlias(name)) {
      val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
      generator.initialize(KeyGenParameterSpec.Builder(name, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(false).build())
      generator.generateKeyPair()
    }
    Base64.encodeToString(store().getCertificate(name).publicKey.encoded, Base64.NO_WRAP)
  }
  private fun storageKey(): SecretKey = synchronized(lock) {
    val name = "oneleadq-trust-storage-v1"
    if (!store().containsAlias(name)) {
      val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      generator.init(KeyGenParameterSpec.Builder(name, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).setUserAuthenticationRequired(false).build())
      generator.generateKey()
    }
    store().getKey(name, null) as SecretKey
  }
  private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun pin(cert: X509Certificate): String = hex(MessageDigest.getInstance("SHA-256").digest(cert.encoded))
  private fun readRecords(): String? = synchronized(lock) {
    val file = File(context.noBackupFilesDir, "oneleadq-trust-v1.bin")
    if (!file.exists()) return@synchronized null
    require(file.length() in 13L..1048576L) { "Encrypted trust record invalid; refuse silent reset" }
    val bytes = file.readBytes()
    // Existing ciphertext must never cause a new identity to silently authorize anything.
    require(store().containsAlias("oneleadq-trust-storage-v1")) { "Secure storage key unavailable; explicit re-pair required" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, storageKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
  }
  private fun writeRecords(value: String) = synchronized(lock) {
    require(value.length <= 524288 && JSONObject(value).getInt("version") == 1) { "Invalid trust records" }
    require(!value.contains("\"pairingCode\"") && !value.contains("\"sessionToken\"")) { "Pairing codes and sessions must never be persisted" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, storageKey())
    val file = File(context.noBackupFilesDir, "oneleadq-trust-v1.bin")
    val temporary = File(context.noBackupFilesDir, "oneleadq-trust-v1.tmp")
    temporary.outputStream().use { stream -> stream.write(cipher.iv); stream.write(cipher.doFinal(value.toByteArray(Charsets.UTF_8))); stream.fd.sync() }
    check(temporary.renameTo(file)) { "Encrypted trust commit failed" }
  }
  override fun definition() = ModuleDefinition {
    Name("OneLeadQTrust")
    AsyncFunction("randomId") { java.util.UUID.randomUUID().toString() }
    AsyncFunction("identity") { gatewayId: String -> identity(gatewayId) }
    AsyncFunction("sign") { gatewayId: String, payload: String ->
      require(payload.length <= 4096 && (payload.startsWith("oneleadq-enroll-v1\n$gatewayId\n") || payload.startsWith("oneleadq-reconnect-v1\n$gatewayId\n"))) { "Identity signature namespace rejected" }
      val key = store().getKey(alias(gatewayId), null) as? PrivateKey ?: throw IllegalStateException("Device key missing; re-pair required")
      val signature = Signature.getInstance("SHA256withECDSA")
      signature.initSign(key); signature.update(payload.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(signature.sign(), Base64.NO_WRAP)
    }
    AsyncFunction("readRecords") { readRecords() }
    AsyncFunction("writeRecords") { value: String -> writeRecords(value); true }
    AsyncFunction("deleteIdentity") { gatewayId: String -> synchronized(lock) { store().deleteEntry(alias(gatewayId)) }; true }
    AsyncFunction("request") { endpoint: String, fingerprint: String, route: String, method: String, body: String?, token: String?, requestId: String? ->
      val base = URL(endpoint)
      require(base.protocol == "https" && base.userInfo == null && (base.path.isEmpty() || base.path == "/") && base.query == null && base.ref == null) { "Encrypted gateway origin required" }
      require(fingerprint.matches(Regex("[a-f0-9]{64}"))) { "Authenticated laptop certificate fingerprint required" }
      require(route.matches(Regex("/(trusted/(enroll|challenge|reconnect|status|audit|forget|requests/[a-f0-9-]{36})|windows/jobs(/[a-f0-9-]{36}(/cancel)?)?|orchestrator/runs(/[a-f0-9-]{36}(/(cancel|approve|execute))?)?)"))) { "Native transport route rejected" }
      require(method == "GET" || method == "POST")
      val trustManager = object : X509TrustManager {
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw CertificateException("Client CA trust is not used") }
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
          if (chain.isEmpty() || !MessageDigest.isEqual(pin(chain[0]).toByteArray(), fingerprint.toByteArray())) throw CertificateException("TLS_PIN_MISMATCH: laptop identity changed; do not reconnect automatically")
          chain[0].checkValidity()
        }
      }
      val ssl = SSLContext.getInstance("TLS"); ssl.init(null, arrayOf(trustManager), null)
      val connection = URL(endpoint.trimEnd('/') + route).openConnection() as HttpsURLConnection
      connection.sslSocketFactory = ssl.socketFactory
      // Host/IP is discovery data; exact authenticated certificate pin is the laptop identity.
      connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { _, session ->
        val leaf = session.peerCertificates.firstOrNull() as? X509Certificate
        leaf != null && MessageDigest.isEqual(pin(leaf).toByteArray(), fingerprint.toByteArray())
      }
      connection.instanceFollowRedirects = false; connection.connectTimeout = 5000; connection.readTimeout = 15000
      connection.requestMethod = method; connection.setRequestProperty("Content-Type", "application/json")
      if (!token.isNullOrEmpty()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (!requestId.isNullOrEmpty()) connection.setRequestProperty("Idempotency-Key", requestId)
      try {
        if (body != null) { require(body.length <= 256000); connection.doOutput = true; connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) } }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val bytes = stream?.use { it.readBytesBounded(1048576) } ?: ByteArray(0)
        mapOf("status" to status, "body" to String(bytes, Charsets.UTF_8))
      } finally { connection.disconnect() }
    }
    AsyncFunction("discover") { gatewayId: String, promise: Promise ->
      alias(gatewayId)
      val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
      val found = Collections.synchronizedList(mutableListOf<String>())
      val done = AtomicBoolean(false); val resolving = AtomicBoolean(false); val available = AtomicBoolean(false)
      lateinit var listener: NsdManager.DiscoveryListener
      fun finish() { if (done.compareAndSet(false, true)) { try { manager.stopServiceDiscovery(listener) } catch (_: Exception) {} ; promise.resolve(mapOf("endpoints" to synchronized(found) { found.toList() }, "available" to available.get())) } }
      listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(type: String) { available.set(true) }
        override fun onStartDiscoveryFailed(type: String, error: Int) { finish() }
        override fun onStopDiscoveryFailed(type: String, error: Int) { finish() }
        override fun onDiscoveryStopped(type: String) {}
        override fun onServiceLost(info: NsdServiceInfo) {}
        override fun onServiceFound(info: NsdServiceInfo) {
          if (done.get() || !resolving.compareAndSet(false, true)) return
          @Suppress("DEPRECATION")
          try { manager.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(service: NsdServiceInfo, error: Int) { resolving.set(false) }
            override fun onServiceResolved(service: NsdServiceInfo) {
              resolving.set(false)
              val identity = service.attributes["gatewayId"]?.toString(Charsets.UTF_8)
              @Suppress("DEPRECATION") val host = service.host?.hostAddress
              if (!done.get() && identity == gatewayId && host != null && host.matches(Regex("[0-9.]+")) && service.port in 1..65535) found.add("https://$host:${service.port}")
            }
          }) } catch (_: Exception) { resolving.set(false) }
        }
      }
      try { manager.discoverServices("_oneleadq._tcp.", NsdManager.PROTOCOL_DNS_SD, listener); Handler(Looper.getMainLooper()).postDelayed({ finish() }, 4000) }
      catch (_: Exception) { finish() }
    }
  }
}
private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
  val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(4096)
  while (true) { val count = read(buffer); if (count < 0) break; require(out.size() + count <= limit) { "Gateway response too large" }; out.write(buffer, 0, count) }
  return out.toByteArray()
}
