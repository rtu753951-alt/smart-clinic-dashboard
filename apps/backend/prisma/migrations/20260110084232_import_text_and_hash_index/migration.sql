-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Import" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "file_hash" TEXT,
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "dataset" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload_csv',
    "mode" TEXT NOT NULL DEFAULT 'replace',
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "duration_ms" INTEGER,
    "error_summary" TEXT,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "quarantine_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "report_json" TEXT NOT NULL DEFAULT '{"issues":[]}'
);
INSERT INTO "new_Import" ("dataset", "duration_ms", "error_summary", "file_hash", "filename", "finished_at", "id", "imported_at", "mode", "quarantine_count", "report_json", "source", "started_at", "status", "valid_count", "warning_count") SELECT "dataset", "duration_ms", "error_summary", "file_hash", "filename", "finished_at", "id", "imported_at", "mode", "quarantine_count", "report_json", "source", "started_at", "status", "valid_count", "warning_count" FROM "Import";
DROP TABLE "Import";
ALTER TABLE "new_Import" RENAME TO "Import";
CREATE INDEX "Import_imported_at_idx" ON "Import"("imported_at");
CREATE INDEX "Import_file_hash_idx" ON "Import"("file_hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
