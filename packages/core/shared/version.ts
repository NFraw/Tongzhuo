// packages/core/shared/version.ts

/**
 * Protocol version for client-server compatibility checking.
 *
 * Semver-like: MAJOR.MINOR.PATCH
 * - MAJOR: breaking changes to wire protocol (reject incompatible clients)
 * - MINOR: additive changes (new events, new optional fields — backward compatible)
 * - PATCH: no wire changes (bug fixes, internal refactors)
 *
 * When making changes:
 * - Client-only (renderer, UI): no version bump needed
 * - Additive protocol change (new optional field/event): bump MINOR
 * - Breaking protocol change (changed field name, removed event): bump MAJOR
 */
export const PROTOCOL_VERSION = '1.7.0'

/** Extract the major version number from a version string. */
export function parseMajor(version: string): number {
  const match = version.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

/** Check if two version strings are compatible (same major version). */
export function isCompatible(clientVersion: string, serverVersion: string): boolean {
  return parseMajor(clientVersion) === parseMajor(serverVersion)
}
