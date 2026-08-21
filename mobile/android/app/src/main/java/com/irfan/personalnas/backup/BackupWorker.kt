package com.irfan.personalnas.backup

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class BackupWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val dao = NasBackupDatabase.getInstance(context).mediaSyncDao()
    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.MINUTES)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val serverUrl = inputData.getString(KEY_SERVER_URL) ?: return@withContext Result.failure()
        val token = inputData.getString(KEY_AUTH_TOKEN) ?: return@withContext Result.failure()
        val targetDrive = inputData.getString(KEY_TARGET_DRIVE) ?: "C:"
        val deviceName = inputData.getString(KEY_DEVICE_NAME) ?: sanitizeDeviceName()

        val cleanDrive = targetDrive.trimEnd('/', '\\')
        val targetDir = "$cleanDrive\\NAS_Backup\\$deviceName\\"

        val pendingItems = dao.getItemsByStatus(SyncStatus.PENDING)
        if (pendingItems.isEmpty()) {
            return@withContext Result.success()
        }

        val total = pendingItems.size
        createNotificationChannel()

        pendingItems.forEachIndexed { index, item ->
            if (isStopped) return@withContext Result.retry()

            val progressPercent = ((index.toFloat() / total) * 100).toInt()
            try {
                setForeground(createForegroundInfo(item.displayName, index + 1, total, progressPercent))
            } catch (e: Exception) {}
            setProgress(workDataOf("PROGRESS" to progressPercent, "CURRENT_FILE" to item.displayName))

            dao.updateSyncStatus(item.mediaStoreId, SyncStatus.SYNCING)

            try {
                val uri = Uri.parse(item.contentUri)
                
                // SHA-256 calculation for deduplication
                val fileHash = calculateSha256(uri)
                dao.updateHash(item.mediaStoreId, fileHash)

                // Stream and upload
                val success = uploadFile(serverUrl, token, uri, item.displayName, item.mimeType, targetDir)

                if (success) {
                    val finalRemotePath = "$targetDir${item.displayName}"
                    dao.updateSyncStatus(item.mediaStoreId, SyncStatus.SYNCED, remotePath = finalRemotePath)
                } else {
                    dao.updateSyncStatus(item.mediaStoreId, SyncStatus.FAILED, error = "Server upload failed")
                }
            } catch (e: Exception) {
                dao.updateSyncStatus(item.mediaStoreId, SyncStatus.FAILED, error = e.message)
            }
        }

        Result.success()
    }

    private fun uploadFile(
        serverUrl: String,
        token: String,
        uri: Uri,
        fileName: String,
        mimeType: String,
        targetDir: String
    ): Boolean {
        val inputStream: InputStream = context.contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Cannot open ContentResolver stream")

        val fileBytes = inputStream.use { it.readBytes() }

        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("targetDir", targetDir)
            .addFormDataPart(
                "file",
                fileName,
                fileBytes.toRequestBody(mimeType.toMediaTypeOrNull(), 0, fileBytes.size)
            )
            .build()

        val uploadEndpoint = "$serverUrl/api/upload?destination=" + java.net.URLEncoder.encode(targetDir, "UTF-8")

        val request = Request.Builder()
            .url(uploadEndpoint)
            .header("Authorization", "Bearer $token")
            .post(requestBody)
            .build()

        val response = httpClient.newCall(request).execute()
        return response.use { it.isSuccessful }
    }

    private fun calculateSha256(uri: Uri): String {
        val digest = MessageDigest.getInstance("SHA-256")
        context.contentResolver.openInputStream(uri)?.use { stream ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (stream.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun createForegroundInfo(fileName: String, current: Int, total: Int, progress: Int): ForegroundInfo {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("myNAS Auto-Backup")
            .setContentText("Backing up ($current/$total): $fileName")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .build()

        return ForegroundInfo(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "myNAS Auto-Backup Service",
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun sanitizeDeviceName(): String {
        val raw = "${Build.MANUFACTURER}_${Build.MODEL}"
        return raw.replace("[^a-zA-Z0-9_-]".toRegex(), "_")
    }

    companion object {
        const val KEY_SERVER_URL = "KEY_SERVER_URL"
        const val KEY_AUTH_TOKEN = "KEY_AUTH_TOKEN"
        const val KEY_TARGET_DRIVE = "KEY_TARGET_DRIVE"
        const val KEY_DEVICE_NAME = "KEY_DEVICE_NAME"

        private const val CHANNEL_ID = "nas_backup_channel"
        private const val NOTIFICATION_ID = 1001
    }
}
