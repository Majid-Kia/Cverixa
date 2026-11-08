import type { Prisma } from "@/generated/prisma/client";

/** Narrow arbitrary structured data to Prisma's JSON input type. */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
