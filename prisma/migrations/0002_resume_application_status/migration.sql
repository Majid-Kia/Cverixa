-- Manual application tracking: one status per resume, shared by all of its versions.
-- Existing resumes start as "pending".
ALTER TABLE "Resume" ADD COLUMN "applicationStatus" TEXT NOT NULL DEFAULT 'pending';
