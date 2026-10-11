import { Search } from "lucide-react";
import { cn } from "./cn";

/**
 * UI icons come from lucide-react (import them directly where needed). SearchIcon is kept as a
 * named wrapper because several components already use it; size follows the font size (1em).
 */
export function SearchIcon({ className }: { className?: string }) {
  return <Search className={cn("h-[1em] w-[1em]", className)} aria-hidden strokeWidth={2} />;
}
