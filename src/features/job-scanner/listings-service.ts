import "server-only";
import { createJobDescription } from "@/features/job-analysis/service";
import { jobAnalysisSchema } from "@/features/job-analysis/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import {
  LISTING_STATUSES,
  SPONSORSHIP_RANK,
  SPONSORSHIP_STATUSES,
  type ListingArrangement,
  type ListingStatus,
  type RelocationStatus,
  type SponsorshipStatus,
} from "./constants";
import { resolveLocation } from "./countries";
import { inferArrangement, type Candidate } from "./pipeline";
import {
  evidenceSchema,
  importJobSchema,
  listingStatusSchema,
  matchBreakdownSchema,
  missingQualificationSchema,
  type MatchBreakdown,
  type MissingQualification,
} from "./schema";
import { classifyVisaSupport, type Evidence, type VisaSupport } from "./sponsorship";
import { sourceIdForHost } from "./sources/registry";
import { buildDedupeKey, canonicalUrl, cleanLine, cleanText, descriptionHash, sha256 } from "./text";
import { z } from "zod";

export interface ListingView {
  id: string;
  sourceId: string;
  ingestion: "automatic" | "manual";
  url: string;
  applyUrl: string | null;
  title: string;
  company: string;
  location: string;
  countryCode: string | null;
  city: string | null;
  workArrangement: ListingArrangement;
  postedAt: Date | null;
  discoveredAt: Date;
  lastSeenAt: Date;
  sponsorshipStatus: SponsorshipStatus;
  sponsorshipEvidence: Evidence[];
  relocationStatus: RelocationStatus;
  relocationEvidence: Evidence[];
  workAuthRequired: boolean;
  workAuthEvidence: Evidence[];
  status: ListingStatus;
  matchScore: number | null;
  matchingSkills: string[];
  missingQualifications: MissingQualification[];
  /** completed | failed | null (not analysed yet) */
  analysisStatus: string | null;
  analysisFailure: string | null;
  jobDescriptionId: string | null;
  alsoSeenOn: Array<{ sourceId: string; url: string }>;
}

type ListingRow = Prisma.JobListingGetPayload<{ include: { analysis: true } }>;

const evidenceList = (value: unknown): Evidence[] =>
  z
    .array(evidenceSchema)
    .catch([])
    .parse(value ?? []);
const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T =>
  (values as readonly string[]).includes(value) ? (value as T) : fallback;

function toView(row: ListingRow): ListingView {
  // A score belongs to the description it was computed from.
  const current = row.analysis && row.analysis.descriptionHash === row.descriptionHash ? row.analysis : null;
  return {
    id: row.id,
    sourceId: row.sourceId,
    ingestion: row.ingestion === "manual" ? "manual" : "automatic",
    url: row.url,
    applyUrl: row.applyUrl,
    title: row.title,
    company: row.company,
    location: row.location,
    countryCode: row.countryCode,
    city: row.city,
    workArrangement: oneOf(["onsite", "hybrid", "remote", "unknown"] as const, row.workArrangement, "unknown"),
    postedAt: row.postedAt,
    discoveredAt: row.discoveredAt,
    lastSeenAt: row.lastSeenAt,
    sponsorshipStatus: oneOf(SPONSORSHIP_STATUSES, row.sponsorshipStatus, "unknown"),
    sponsorshipEvidence: evidenceList(row.sponsorshipEvidence),
    relocationStatus: oneOf(["offered", "not_offered", "unknown"] as const, row.relocationStatus, "unknown"),
    relocationEvidence: evidenceList(row.relocationEvidence),
    workAuthRequired: row.workAuthRequired,
    workAuthEvidence: evidenceList(row.workAuthEvidence),
    status: oneOf(LISTING_STATUSES, row.status, "new"),
    matchScore: current?.score ?? null,
    matchingSkills: z
      .array(z.string())
      .catch([])
      .parse(current?.matchingSkills ?? []),
    missingQualifications: z
      .array(missingQualificationSchema)
      .catch([])
      .parse(current?.missingQualifications ?? []),
    analysisStatus: current?.status ?? null,
    analysisFailure: current?.status === "failed" ? current.failureReason : null,
    jobDescriptionId: row.jobDescriptionId,
    alsoSeenOn: z
      .array(z.object({ sourceId: z.string(), url: z.string() }))
      .catch([])
      .parse(row.alsoSeenOn ?? []),
  };
}

/** The columns that hold a classification, from a `VisaSupport` value. */
export function visaColumns(visa: VisaSupport) {
  return {
    sponsorshipStatus: visa.sponsorship.status,
    sponsorshipRank: SPONSORSHIP_RANK[visa.sponsorship.status],
    sponsorshipEvidence: toJson(visa.sponsorship.evidence),
    relocationStatus: visa.relocation.status,
    relocationEvidence: toJson(visa.relocation.evidence),
    workAuthRequired: visa.workAuthorization.required,
    workAuthEvidence: toJson(visa.workAuthorization.evidence),
  };
}

export interface SaveOutcome {
  listingId: string;
  outcome: "new" | "duplicate";
  /** The description differs from the stored one, so the listing needs a new analysis. */
  contentChanged: boolean;
}

/**
 * Save a candidate found by a scan. A job that is already known, by the
 * source's id, by its URL or by the same company, title and place, is updated
 * in place: its metadata and "last seen" time change, its tracking status and
 * history do not. Only a job seen for the first time creates a listing.
 */
export async function saveCandidate(
  ownerId: string,
  scanId: string | null,
  candidate: Candidate,
): Promise<SaveOutcome> {
  const now = new Date();
  const existing =
    (await prisma.jobListing.findUnique({
      where: {
        ownerId_sourceId_externalId: { ownerId, sourceId: candidate.sourceId, externalId: candidate.externalId },
      },
    })) ??
    (await prisma.jobListing.findFirst({ where: { ownerId, url: candidate.url } })) ??
    (await prisma.jobListing.findFirst({
      where: { ownerId, dedupeKey: candidate.dedupeKey },
      orderBy: { discoveredAt: "asc" },
    }));

  if (!existing) {
    const created = await prisma.jobListing.create({
      data: {
        ownerId,
        sourceId: candidate.sourceId,
        externalId: candidate.externalId,
        dedupeKey: candidate.dedupeKey,
        url: candidate.url,
        applyUrl: candidate.applyUrl,
        title: candidate.title,
        company: candidate.company,
        location: candidate.location,
        countryCode: candidate.countryCode,
        city: candidate.city,
        workArrangement: candidate.workArrangement,
        description: candidate.description,
        descriptionHash: candidate.descriptionHash,
        postedAt: candidate.postedAt,
        firstScanId: scanId,
        lastScanId: scanId,
        ...visaColumns(candidate.visa),
        events: { create: { ownerId, type: "discovered", toStatus: "new" } },
      },
    });
    return { listingId: created.id, outcome: "new", contentChanged: true };
  }

  const sameSource = existing.sourceId === candidate.sourceId;
  if (!sameSource) {
    // The same job on another source: remember where else it was seen, keep the first record.
    const known = z
      .array(z.object({ sourceId: z.string(), url: z.string() }))
      .catch([])
      .parse(existing.alsoSeenOn ?? []);
    const alsoSeenOn = known.some((item) => item.sourceId === candidate.sourceId)
      ? known
      : [...known, { sourceId: candidate.sourceId, url: candidate.url }].slice(0, 10);
    await prisma.jobListing.update({
      where: { id: existing.id },
      data: { lastSeenAt: now, lastScanId: scanId, seenCount: { increment: 1 }, alsoSeenOn: toJson(alsoSeenOn) },
    });
    return { listingId: existing.id, outcome: "duplicate", contentChanged: false };
  }

  const contentChanged = existing.descriptionHash !== candidate.descriptionHash;
  await prisma.jobListing.update({
    where: { id: existing.id },
    data: {
      lastSeenAt: now,
      lastScanId: scanId,
      seenCount: { increment: 1 },
      url: candidate.url,
      applyUrl: candidate.applyUrl,
      title: candidate.title,
      company: candidate.company,
      location: candidate.location,
      countryCode: candidate.countryCode,
      city: candidate.city,
      workArrangement: candidate.workArrangement,
      postedAt: candidate.postedAt ?? existing.postedAt,
      dedupeKey: candidate.dedupeKey,
      ...(contentChanged
        ? {
            description: candidate.description,
            descriptionHash: candidate.descriptionHash,
            matchScore: null,
            ...visaColumns(candidate.visa),
            events: {
              create: { ownerId, type: "content_updated", detail: "The posting text changed at the source." },
            },
          }
        : {}),
    },
  });
  return { listingId: existing.id, outcome: "duplicate", contentChanged };
}

export type ListingSort = "priority" | "score" | "posted" | "discovered";

export interface ListingFilterInput {
  country?: string;
  title?: string;
  sponsorship?: string;
  source?: string;
  arrangement?: string;
  minScore?: number;
  /** A tracking status, "active" (everything except dismissed and rejected) or "all". */
  status?: string;
  sort?: ListingSort;
  limit?: number;
}

const nullsLast = (sort: "asc" | "desc") => ({ sort, nulls: "last" as const });

export async function listListings(
  ownerId: string,
  filters: ListingFilterInput = {},
): Promise<{ listings: ListingView[]; total: number }> {
  const where: Prisma.JobListingWhereInput = { ownerId };
  if (filters.country) where.countryCode = filters.country;
  if (filters.title?.trim()) where.title = { contains: filters.title.trim().slice(0, 100), mode: "insensitive" };
  if (filters.sponsorship && (SPONSORSHIP_STATUSES as readonly string[]).includes(filters.sponsorship)) {
    where.sponsorshipStatus = filters.sponsorship;
  }
  if (filters.source) where.sourceId = filters.source;
  if (filters.arrangement) where.workArrangement = filters.arrangement;
  if (filters.minScore && filters.minScore > 0) where.matchScore = { gte: filters.minScore };
  const status = filters.status ?? "active";
  if ((LISTING_STATUSES as readonly string[]).includes(status)) where.status = status;
  else if (status !== "all") where.status = { notIn: ["dismissed", "rejected"] };

  const orderBy: Prisma.JobListingOrderByWithRelationInput[] =
    filters.sort === "score"
      ? [{ matchScore: nullsLast("desc") }, { discoveredAt: "desc" }]
      : filters.sort === "posted"
        ? [{ postedAt: nullsLast("desc") }, { discoveredAt: "desc" }]
        : filters.sort === "discovered"
          ? [{ discoveredAt: "desc" }]
          : // Confirmed sponsorship first, then possible; best match first within each.
            [{ sponsorshipRank: "asc" }, { matchScore: nullsLast("desc") }, { discoveredAt: "desc" }];

  const [rows, total] = await Promise.all([
    prisma.jobListing.findMany({
      where,
      orderBy,
      take: Math.min(filters.limit ?? 100, 200),
      include: { analysis: true },
    }),
    prisma.jobListing.count({ where }),
  ]);
  return { listings: rows.map(toView), total };
}

export interface ListingDetail extends ListingView {
  description: string;
  explanation: string;
  breakdown: MatchBreakdown | null;
  requirements: Array<{ description: string; classification: string; category: string; supportingText: string }>;
  analyzedAt: Date | null;
  analysisProvider: string | null;
  events: Array<{
    id: string;
    type: string;
    fromStatus: string | null;
    toStatus: string | null;
    detail: string | null;
    createdAt: Date;
  }>;
  resumes: Array<{ id: string; title: string; updatedAt: Date }>;
}

export async function getListing(ownerId: string, id: string): Promise<ListingDetail> {
  const row = await prisma.jobListing.findFirst({
    where: { id, ownerId },
    include: { analysis: true, events: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  if (!row) throw new NotFoundError("Job listing not found.");
  const current = row.analysis && row.analysis.descriptionHash === row.descriptionHash ? row.analysis : null;
  const analysis = current?.analysis ? jobAnalysisSchema.safeParse(current.analysis) : null;
  const breakdown = current?.breakdown ? matchBreakdownSchema.safeParse(current.breakdown) : null;
  const resumes = row.jobDescriptionId
    ? await prisma.resume.findMany({
        where: { ownerId, jobDescriptionId: row.jobDescriptionId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, updatedAt: true },
      })
    : [];
  return {
    ...toView(row),
    description: row.description,
    explanation: current?.explanation ?? "",
    breakdown: breakdown?.success ? breakdown.data : null,
    requirements: analysis?.success
      ? analysis.data.requirements.map((requirement) => ({
          description: requirement.description,
          classification: requirement.classification,
          category: requirement.category,
          supportingText: requirement.supportingText,
        }))
      : [],
    analyzedAt: current?.analyzedAt ?? null,
    analysisProvider: current?.providerId ? `${current.providerId} / ${current.modelId ?? ""}` : null,
    events: row.events,
    resumes,
  };
}

/** Change the owner's tracking status of a listing and record it in the listing's history. */
export async function setListingStatus(ownerId: string, id: string, status: unknown): Promise<ListingStatus> {
  const next = listingStatusSchema.safeParse(status);
  if (!next.success) throw new AppError("invalid_status", "Unknown job status.");
  const listing = await prisma.jobListing.findFirst({ where: { id, ownerId }, select: { id: true, status: true } });
  if (!listing) throw new NotFoundError("Job listing not found.");
  if (listing.status === next.data) return next.data;
  await prisma.jobListing.update({
    where: { id: listing.id },
    data: {
      status: next.data,
      statusChangedAt: new Date(),
      events: { create: { ownerId, type: "status_changed", fromStatus: listing.status, toStatus: next.data } },
    },
  });
  return next.data;
}

/**
 * Add a posting the owner found on a site the scanner cannot read (LinkedIn,
 * Indeed, a company page). Nothing is fetched: the owner pastes the link and
 * the text. The posting is classified and tracked like any other listing.
 */
export async function importJobPosting(
  ownerId: string,
  input: unknown,
): Promise<{ listingId: string; created: boolean }> {
  const parsed = importJobSchema.safeParse(input);
  if (!parsed.success) throw new AppError("invalid_import", parsed.error.issues[0]?.message ?? "Invalid job posting.");
  const url = canonicalUrl(parsed.data.url);
  if (!url) throw new AppError("invalid_url", "Enter the full link to the posting, starting with https://.");
  const hostname = new URL(url).hostname;
  const sourceId = sourceIdForHost(hostname);
  // LinkedIn job links carry the job id in the path or in currentJobId.
  const linkedInId =
    sourceId === "linkedin"
      ? (url.match(/\/jobs\/view\/(?:[^/?]*-)?(\d{6,})/)?.[1] ?? new URL(url).searchParams.get("currentJobId"))
      : null;
  const externalId = linkedInId ?? sha256(url).slice(0, 32);
  const description = cleanText(parsed.data.description);
  const resolution = resolveLocation(parsed.data.location);
  const visa = classifyVisaSupport(description, { sourceUrl: url });
  const candidate: Candidate = {
    sourceId,
    externalId,
    url,
    applyUrl: null,
    title: cleanLine(parsed.data.title),
    company: cleanLine(parsed.data.company),
    location: cleanLine(parsed.data.location) || "Not stated",
    countryCode: resolution.countries[0] ?? null,
    city: resolution.city,
    workArrangement: inferArrangement(undefined, parsed.data.location, parsed.data.title, description),
    description,
    descriptionHash: descriptionHash(description),
    postedAt: null,
    dedupeKey: buildDedupeKey({
      company: parsed.data.company,
      title: parsed.data.title,
      countryCode: resolution.countries[0] ?? null,
      city: resolution.city,
    }),
    visa,
    matchedKeywords: [],
  };
  const saved = await saveCandidate(ownerId, null, candidate);
  await prisma.jobListing.update({
    where: { id: saved.listingId },
    data: {
      ...(saved.outcome === "new" ? { ingestion: "manual" } : {}),
      events: { create: { ownerId, type: "imported", detail: `Imported by you from ${hostname}.` } },
    },
  });
  return { listingId: saved.listingId, created: saved.outcome === "new" };
}

/**
 * Hand a listing to the existing resume tailoring workflow. The posting
 * becomes a job description (created once per listing); the requirements the
 * scanner already extracted are stored with it so they are not extracted a
 * second time. Resumes generated from that job description belong to the
 * listing through it.
 */
export async function prepareTailoring(ownerId: string, listingId: string): Promise<{ jobDescriptionId: string }> {
  const listing = await prisma.jobListing.findFirst({ where: { id: listingId, ownerId }, include: { analysis: true } });
  if (!listing) throw new NotFoundError("Job listing not found.");
  if (listing.jobDescriptionId) return { jobDescriptionId: listing.jobDescriptionId };
  if (listing.description.trim().length < 50) {
    throw new AppError(
      "description_too_short",
      "This listing has too little text to tailor a resume from. Open the original posting and import its full description.",
    );
  }
  const job = await createJobDescription(ownerId, {
    originalText: listing.description,
    title: listing.title,
    company: listing.company,
    location: listing.location,
    sourceUrl: listing.url.slice(0, 1000),
    notes: "",
  });
  const analysis = listing.analysis;
  const reusable =
    analysis && analysis.status === "completed" && analysis.descriptionHash === listing.descriptionHash
      ? jobAnalysisSchema.safeParse(analysis.analysis)
      : null;
  if (reusable?.success && analysis) {
    await prisma.jobDescription.update({
      where: { id: job.id },
      data: {
        structuredRequirements: toJson(reusable.data),
        analysisProviderId: analysis.providerId,
        analysisModelId: analysis.modelId,
        analyzedAt: analysis.analyzedAt,
      },
    });
  }
  await prisma.jobListing.update({
    where: { id: listing.id },
    data: {
      jobDescriptionId: job.id,
      events: { create: { ownerId, type: "tailoring_started", detail: "Opened in the resume tailoring workflow." } },
    },
  });
  return { jobDescriptionId: job.id };
}

export interface ScannerSummary {
  total: number;
  newSinceLastScan: number;
  confirmed: number;
  possible: number;
  highRelevance: number;
  byStatus: Record<string, number>;
  countries: string[];
  sources: string[];
}

/** Counts for the dashboard. Dismissed and rejected listings are left out of the headline numbers. */
export async function getScannerSummary(
  ownerId: string,
  options: { lastScanId: string | null; highRelevanceThreshold: number },
): Promise<ScannerSummary> {
  const active: Prisma.JobListingWhereInput = { ownerId, status: { notIn: ["dismissed", "rejected"] } };
  const [total, newSinceLastScan, confirmed, possible, highRelevance, statuses, countries, sources] = await Promise.all(
    [
      prisma.jobListing.count({ where: { ownerId } }),
      options.lastScanId ? prisma.jobListing.count({ where: { ownerId, firstScanId: options.lastScanId } }) : 0,
      prisma.jobListing.count({ where: { ...active, sponsorshipStatus: "confirmed" } }),
      prisma.jobListing.count({ where: { ...active, sponsorshipStatus: "possible" } }),
      prisma.jobListing.count({ where: { ...active, matchScore: { gte: options.highRelevanceThreshold } } }),
      prisma.jobListing.groupBy({ by: ["status"], where: { ownerId }, _count: { _all: true } }),
      prisma.jobListing.findMany({
        where: { ownerId, countryCode: { not: null } },
        distinct: ["countryCode"],
        select: { countryCode: true },
      }),
      prisma.jobListing.findMany({ where: { ownerId }, distinct: ["sourceId"], select: { sourceId: true } }),
    ],
  );
  return {
    total,
    newSinceLastScan,
    confirmed,
    possible,
    highRelevance,
    byStatus: Object.fromEntries(statuses.map((row) => [row.status, row._count._all])),
    countries: countries.map((row) => row.countryCode!).sort(),
    sources: sources.map((row) => row.sourceId).sort(),
  };
}
