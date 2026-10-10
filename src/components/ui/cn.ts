/** Join class names, skipping falsy values. Tiny clsx replacement. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
