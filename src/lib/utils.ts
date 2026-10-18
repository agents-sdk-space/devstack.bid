/**
 * shadcn convention: components import `cn` from "@/lib/utils".
 * This repo's canonical helper lives in src/components/ui/cn.ts; re-export it so pasted
 * shadcn/21st components work unchanged without adding clsx/tailwind-merge.
 */
export { cn } from "@/components/ui/cn";
