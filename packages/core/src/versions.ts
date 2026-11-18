/**
 * The version to show and cook by default: the newest adapted version, or the original when
 * there is no other. Expects versions in API order (original first, then oldest to newest).
 */
export function defaultVersion<T extends { is_original: boolean }>(versions: T[]): T | undefined {
  return versions.findLast((v) => !v.is_original) ?? versions[0];
}
