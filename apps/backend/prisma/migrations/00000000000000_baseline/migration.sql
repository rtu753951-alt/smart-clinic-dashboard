-- CreateTable
CREATE TABLE "Import" (
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
    "report_json" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staff_name" TEXT NOT NULL,
    "staff_type" TEXT NOT NULL,
    "specialty" TEXT,
    "skill_level" TEXT,
    "certified_services" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active'
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service_name" TEXT NOT NULL,
    "category" TEXT,
    "price" REAL,
    "duration" INTEGER,
    "buffer_time" INTEGER,
    "executor_role" TEXT,
    "intensity_level" TEXT,
    "transferable" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT,
    "status" TEXT NOT NULL,
    "customer_id" TEXT,
    "doctor_id" TEXT,
    "doctor_name" TEXT,
    "staff_role" TEXT,
    "service_id" TEXT,
    "service_item" TEXT,
    "purchased_services" TEXT,
    "room" TEXT,
    "equipment" TEXT,
    "raw_source" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "is_new" BOOLEAN,
    CONSTRAINT "Appointment_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "Import" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuarantineAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "import_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_index" INTEGER NOT NULL,
    "appointment_id" TEXT,
    "raw_data" TEXT NOT NULL,
    "issues_json" TEXT NOT NULL,
    CONSTRAINT "QuarantineAppointment_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "Import" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Import_imported_at_idx" ON "Import"("imported_at");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_staff_name_key" ON "Staff"("staff_name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_service_name_key" ON "Service"("service_name");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_appointment_id_key" ON "Appointment"("appointment_id");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_import_id_idx" ON "Appointment"("import_id");

-- CreateIndex
CREATE INDEX "QuarantineAppointment_import_id_idx" ON "QuarantineAppointment"("import_id");

-- CreateIndex
CREATE INDEX "QuarantineAppointment_created_at_idx" ON "QuarantineAppointment"("created_at");

