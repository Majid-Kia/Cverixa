-- Job Scanner: search preferences, source settings, discovered listings, match analyses,
-- listing history and scan runs. Additive only: no existing table or column is changed.
CREATE TABLE "JobSearchPreferences" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "countries" JSONB NOT NULL,
    "keywords" JSONB NOT NULL,
    "workArrangements" JSONB NOT NULL,
    "requireSponsorship" BOOLEAN NOT NULL DEFAULT false,
    "preferRelocation" BOOLEAN NOT NULL DEFAULT true,
    "excludeWorkAuthRequired" BOOLEAN NOT NULL DEFAULT true,
    "excludeNoSponsorship" BOOLEAN NOT NULL DEFAULT true,
    "aiMatchingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxAnalysesPerScan" INTEGER NOT NULL DEFAULT 25,
    "rubric" JSONB,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleTime" TEXT NOT NULL DEFAULT '05:00',
    "scheduleTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSearchPreferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobSourceConfiguration" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSourceConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "countryCode" TEXT,
    "city" TEXT,
    "workArrangement" TEXT NOT NULL DEFAULT 'unknown',
    "description" TEXT NOT NULL,
    "descriptionHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstScanId" TEXT,
    "lastScanId" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "alsoSeenOn" JSONB,
    "ingestion" TEXT NOT NULL DEFAULT 'automatic',
    "sponsorshipStatus" TEXT NOT NULL DEFAULT 'unknown',
    "sponsorshipRank" INTEGER NOT NULL DEFAULT 2,
    "sponsorshipEvidence" JSONB NOT NULL,
    "relocationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "relocationEvidence" JSONB NOT NULL,
    "workAuthRequired" BOOLEAN NOT NULL DEFAULT false,
    "workAuthEvidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "statusChangedAt" TIMESTAMP(3),
    "matchScore" INTEGER,
    "jobDescriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobMatchAnalysis" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "descriptionHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT,
    "modelId" TEXT,
    "analysis" JSONB,
    "signals" JSONB,
    "analyzedAt" TIMESTAMP(3),
    "careerProfileRevisionId" TEXT,
    "rubricVersion" INTEGER,
    "rubricHash" TEXT,
    "score" INTEGER,
    "breakdown" JSONB,
    "explanation" TEXT,
    "matchingSkills" JSONB,
    "missingQualifications" JSONB,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatchAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobListingEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobListingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobScan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeLock" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countries" JSONB NOT NULL,
    "keywords" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "progress" JSONB,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "filteredCount" INTEGER NOT NULL DEFAULT 0,
    "analyzedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "diagnostics" JSONB,

    CONSTRAINT "JobScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobScanSourceResult" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobScanSourceResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobSearchPreferences_ownerId_key" ON "JobSearchPreferences"("ownerId");

CREATE INDEX "JobSearchPreferences_scheduleEnabled_nextRunAt_idx" ON "JobSearchPreferences"("scheduleEnabled", "nextRunAt");

CREATE UNIQUE INDEX "JobSourceConfiguration_ownerId_sourceId_key" ON "JobSourceConfiguration"("ownerId", "sourceId");

CREATE UNIQUE INDEX "JobListing_jobDescriptionId_key" ON "JobListing"("jobDescriptionId");

CREATE INDEX "JobListing_ownerId_dedupeKey_idx" ON "JobListing"("ownerId", "dedupeKey");

CREATE INDEX "JobListing_ownerId_status_idx" ON "JobListing"("ownerId", "status");

CREATE INDEX "JobListing_ownerId_sponsorshipRank_matchScore_idx" ON "JobListing"("ownerId", "sponsorshipRank", "matchScore");

CREATE INDEX "JobListing_ownerId_discoveredAt_idx" ON "JobListing"("ownerId", "discoveredAt");

CREATE UNIQUE INDEX "JobListing_ownerId_sourceId_externalId_key" ON "JobListing"("ownerId", "sourceId", "externalId");

CREATE UNIQUE INDEX "JobMatchAnalysis_listingId_key" ON "JobMatchAnalysis"("listingId");

CREATE INDEX "JobMatchAnalysis_ownerId_status_idx" ON "JobMatchAnalysis"("ownerId", "status");

CREATE INDEX "JobListingEvent_listingId_createdAt_idx" ON "JobListingEvent"("listingId", "createdAt");

CREATE UNIQUE INDEX "JobScan_activeLock_key" ON "JobScan"("activeLock");

CREATE INDEX "JobScan_ownerId_startedAt_idx" ON "JobScan"("ownerId", "startedAt");

CREATE UNIQUE INDEX "JobScan_ownerId_scheduledFor_key" ON "JobScan"("ownerId", "scheduledFor");

CREATE INDEX "JobScanSourceResult_scanId_idx" ON "JobScanSourceResult"("scanId");

CREATE INDEX "JobScanSourceResult_sourceId_status_createdAt_idx" ON "JobScanSourceResult"("sourceId", "status", "createdAt");

ALTER TABLE "JobSearchPreferences" ADD CONSTRAINT "JobSearchPreferences_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobSourceConfiguration" ADD CONSTRAINT "JobSourceConfiguration_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobListingEvent" ADD CONSTRAINT "JobListingEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobListingEvent" ADD CONSTRAINT "JobListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobScan" ADD CONSTRAINT "JobScan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobScanSourceResult" ADD CONSTRAINT "JobScanSourceResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "JobScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
