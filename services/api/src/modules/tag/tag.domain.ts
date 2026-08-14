import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Tag domain — pure rules: name normalization, the ownerType registry with
// per-type existence validators, duplicate-id dedup and DB error guards.
// No DB / IO imports, so these are unit-testable without a database.
// ---------------------------------------------------------------------------

/** Current business owner type for tag relations (moment only, for now). */
export const MOMENT_TAG_OWNER_TYPE = 'moment'

/** All registered owner types — the anti-garbage-data allowlist. */
export const TAG_OWNER_TYPES = ['moment'] as const
export type TagOwnerType = (typeof TAG_OWNER_TYPES)[number]

/**
 * Normalize a tag name before storage/display: trim + lowercase.
 * Chinese tags have no case, so normalization is a no-op for them.
 * Zod already enforces trim/min/max(32); this runs on the parsed value.
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase()
}

/** Deduplicate tag ids, preserving the first-seen order. */
export function uniqueTagIds(ids: string[]): string[] {
  return [...new Set(ids)]
}

/**
 * Existence validator for a registered owner type. Receives a minimal query
 * client (the singleton `db` or a transaction `tx`) so the check can run
 * inside transactions; throws AppError 404 when the owner row is missing.
 * Implementations are registered by the service layer (which owns the real
 * DB queries) — the registry itself stays pure.
 */
export type OwnerExistenceValidator = (client: unknown, ownerId: string) => Promise<void>

const ownerValidators = new Map<string, OwnerExistenceValidator>()

/** Register the existence validator for an owner type (service layer calls this). */
export function registerOwnerValidator(
  ownerType: string,
  validator: OwnerExistenceValidator,
): void {
  ownerValidators.set(ownerType, validator)
}

/** Drop a registered owner type (used when an owner module is removed; also
 *  lets tests restore the registry after temporarily registering extras). */
export function unregisterOwnerValidator(ownerType: string): void {
  ownerValidators.delete(ownerType)
}

/** Throw VALIDATION 400 for owner types that are not registered. */
export function assertRegisteredOwnerType(ownerType: string): void {
  if (!ownerValidators.has(ownerType)) {
    throw new AppError(ErrorCode.VALIDATION, '不支持的标签绑定类型', 400)
  }
}

/** Return the registered existence validator, or throw 400. */
export function getOwnerValidator(ownerType: string): OwnerExistenceValidator {
  const validator = ownerValidators.get(ownerType)
  if (!validator) {
    throw new AppError(ErrorCode.VALIDATION, '不支持的标签绑定类型', 400)
  }
  return validator
}

// ---- DB error guards -------------------------------------------------------

// Drizzle-generated constraint names (single source of truth for the guard).
export const TAGS_NAME_UNIQUE = 'tags_name_unique'
export const TAG_RELATIONS_UNIQUE = 'tag_relations_tag_id_owner_type_owner_id_unique'

/**
 * True when the error is a unique-constraint violation for the given
 * constraint. drizzle-orm wraps the driver error in a DrizzleQueryError with
 * the original PostgresError under `.cause`; the raw driver reports the
 * constraint as `constraint` (and the PG server as `constraint_name`) —
 * unwrap and check both.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (!err || typeof err !== 'object') return false
  const cause = (err as { cause?: unknown }).cause ?? err
  if (!cause || typeof cause !== 'object') return false
  const e = cause as {
    code?: unknown
    constraint?: unknown
    constraint_name?: unknown
  }
  return e.code === '23505' && (e.constraint === constraint || e.constraint_name === constraint)
}

/** True when the error is any foreign-key violation (race: row deleted mid-flight). */
export function isForeignKeyViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const cause = (err as { cause?: unknown }).cause ?? err
  if (!cause || typeof cause !== 'object') return false
  return (cause as { code?: unknown }).code === '23503'
}
