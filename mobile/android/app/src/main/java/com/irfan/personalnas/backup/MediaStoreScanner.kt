package com.irfan.personalnas.backup

import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MediaStoreScanner(private val context: Context) {

    private val dao = NasBackupDatabase.getInstance(context).mediaSyncDao()

    suspend fun scanAndIndexMedia(): Int = withContext(Dispatchers.IO) {
        val discoveredMedia = mutableListOf<MediaSyncEntity>()
        
        // 1. Scan Photos directly from MediaStore (No File Picker)
        discoveredMedia.addAll(queryCollection(
            collectionUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            },
            isVideo = false
        ))

        // 2. Scan Videos directly from MediaStore
        discoveredMedia.addAll(queryCollection(
            collectionUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            } else {
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            },
            isVideo = true
        ))

        // 3. Batch insert (ignores already recorded items)
        dao.insertAll(discoveredMedia)
        discoveredMedia.size
    }

    private fun queryCollection(collectionUri: Uri, isVideo: Boolean): List<MediaSyncEntity> {
        val mediaList = mutableListOf<MediaSyncEntity>()

        val projection = mutableListOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.DATE_MODIFIED
        ).apply {
            if (isVideo) add(MediaStore.Video.VideoColumns.DURATION)
        }.toTypedArray()

        val sortOrder = "${MediaStore.MediaColumns.DATE_MODIFIED} DESC"

        val cursor: Cursor? = context.contentResolver.query(
            collectionUri,
            projection,
            null,
            null,
            sortOrder
        )

        cursor?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val nameCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            val mimeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
            val sizeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
            val dateCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED)
            val durationCol = if (isVideo) c.getColumnIndex(MediaStore.Video.VideoColumns.DURATION) else -1

            while (c.moveToNext()) {
                val id = c.getLong(idCol)
                val displayName = c.getString(nameCol) ?: "media_$id"
                val mimeType = c.getString(mimeCol) ?: if (isVideo) "video/*" else "image/*"
                val size = c.getLong(sizeCol)
                val dateModified = c.getLong(dateCol)
                val duration = if (durationCol != -1) c.getLong(durationCol) else 0L

                if (size <= 0) continue

                val contentUri = ContentUris.withAppendedId(collectionUri, id).toString()

                mediaList.add(
                    MediaSyncEntity(
                        mediaStoreId = id,
                        contentUri = contentUri,
                        displayName = displayName,
                        mimeType = mimeType,
                        sizeBytes = size,
                        dateModifiedSec = dateModified,
                        isVideo = isVideo,
                        durationMs = duration,
                        syncStatus = SyncStatus.PENDING
                    )
                )
            }
        }
        return mediaList
    }
}
