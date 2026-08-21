package com.irfan.personalnas.backup

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

object BackupScheduler {

    private const val UNIQUE_BACKUP_WORK_NAME = "myNAS_AutoBackup_Work"

    fun startImmediateBackup(
        context: Context,
        serverUrl: String,
        token: String,
        targetDrive: String,
        deviceName: String,
        requireWifiOnly: Boolean = false
    ) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (requireWifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .build()

        val inputData = workDataOf(
            BackupWorker.KEY_SERVER_URL to serverUrl,
            BackupWorker.KEY_AUTH_TOKEN to token,
            BackupWorker.KEY_TARGET_DRIVE to targetDrive,
            BackupWorker.KEY_DEVICE_NAME to deviceName
        )

        val workRequest = OneTimeWorkRequestBuilder<BackupWorker>()
            .setConstraints(constraints)
            .setInputData(inputData)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            UNIQUE_BACKUP_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            workRequest
        )
    }

    fun schedulePeriodicBackup(
        context: Context,
        serverUrl: String,
        token: String,
        targetDrive: String,
        deviceName: String
    ) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val inputData = workDataOf(
            BackupWorker.KEY_SERVER_URL to serverUrl,
            BackupWorker.KEY_AUTH_TOKEN to token,
            BackupWorker.KEY_TARGET_DRIVE to targetDrive,
            BackupWorker.KEY_DEVICE_NAME to deviceName
        )

        val periodicWork = PeriodicWorkRequestBuilder<BackupWorker>(4, TimeUnit.HOURS)
            .setConstraints(constraints)
            .setInputData(inputData)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "${UNIQUE_BACKUP_WORK_NAME}_Periodic",
            ExistingPeriodicWorkPolicy.UPDATE,
            periodicWork
        )
    }
}
