import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({
  className,
  interactive,
  as: Tag = "div",
  ...props
}: HTMLAttributes<HTMLElement> & { interactive?: boolean; as?: "div" | "article" | "section" | "aside" | "li" }) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        interactive && "motion-base hover:border-border-strong hover:bg-surface-2 hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}
export function CardTitle({ className, as: Tag = "h3", ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-base font-semibold leading-snug text-fg", className)} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}
