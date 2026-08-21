package com.irfan.personalnas.backup

import androidx.room.*
import kotlinx.coroutines.flow.Flow

enum class SyncStatus {
    PENDING,
    SYNCING,
    SYNCED,
    FAILED
}

@Entity(
    tableName = "media_sync_records",
    indices = [
        Index(value = ["mediaStoreId"], unique = true),
        Index(value = ["fileHash"]),
        Index(value = ["syncStatus"])
    ]
)
data class MediaSyncEntity(
    @PrimaryKey
    val mediaStoreId: Long,
    val contentUri: String,
    val displayName: String,
    val mimeType: String,
    val sizeBytes: Long,
    val dateModifiedSec: Long,
    val fileHash: String? = null,
    val isVideo: Boolean = false,
    val durationMs: Long = 0,
    var syncStatus: SyncStatus = SyncStatus.PENDING,
    var remotePath: String? = null,
    var lastSyncAttempt: Long? = null,
    var errorMessage: String? = null
)

@Dao
interface MediaSyncDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<MediaSyncEntity>): List<Long>

    @Query("SELECT * FROM media_sync_records ORDER BY dateModifiedSec DESC")
    fun getAllMediaFlow(): Flow<List<MediaSyncEntity>>

    @Query("SELECT * FROM media_sync_records WHERE syncStatus = :status ORDER BY dateModifiedSec ASC")
    suspend fun getItemsByStatus(status: SyncStatus): List<MediaSyncEntity>

    @Query("SELECT COUNT(*) FROM media_sync_records WHERE syncStatus = 'PENDING'")
    fun getPendingCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM media_sync_records WHERE syncStatus = 'SYNCED'")
    fun getSyncedCountFlow(): Flow<Int>

    @Query("SELECT * FROM media_sync_records WHERE fileHash = :hash AND syncStatus = 'SYNCED' LIMIT 1")
    suspend fun findByHash(hash: String): MediaSyncEntity?

    @Query("UPDATE media_sync_records SET syncStatus = :status, remotePath = :remotePath, lastSyncAttempt = :timestamp, errorMessage = :error WHERE mediaStoreId = :id")
    suspend fun updateSyncStatus(id: Long, status: SyncStatus, remotePath: String? = null, timestamp: Long = System.currentTimeMillis(), error: String? = null)

    @Query("UPDATE media_sync_records SET fileHash = :hash WHERE mediaStoreId = :id")
    suspend fun updateHash(id: Long, hash: String)
}
