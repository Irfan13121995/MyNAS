package com.irfan.personalnas.backup

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [MediaSyncEntity::class], version = 1, exportSchema = false)
abstract class NasBackupDatabase : RoomDatabase() {
    abstract fun mediaSyncDao(): MediaSyncDao

    companion object {
        @Volatile private var INSTANCE: NasBackupDatabase? = null

        fun getInstance(context: Context): NasBackupDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    NasBackupDatabase::class.java,
                    "nas_backup.db"
                ).fallbackToDestructiveMigration().build().also { INSTANCE = it }
            }
        }
    }
}
