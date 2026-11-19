-- Cover letters: one per job description, generated from the confirmed profile and editable as plain text.
CREATE TABLE "CoverLetter" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "careerProfileRevisionId" TEXT,
    "body" TEXT NOT NULL,
    "report" JSONB,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "userInstructions" TEXT,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverLetter_jobDescriptionId_key" ON "CoverLetter"("jobDescriptionId");

CREATE INDEX "CoverLetter_ownerId_updatedAt_idx" ON "CoverLetter"("ownerId", "updatedAt");

ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
