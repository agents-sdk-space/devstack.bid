import Link from "next/link";
import { T } from "@/components/prefs";
import { buttonClasses, EmptyState } from "@/components/ui";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState
        icon={<Compass className="h-6 w-6" strokeWidth={1.75} />}
        headingAs="h1"
        title={
          <>
            404 · <T k="notFound" />
          </>
        }
        description={<T k="notFound.body" />}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonClasses("primary")}>
              <T k="nav.home" />
            </Link>
            <Link href="/templates" className={buttonClasses("secondary")}>
              <T k="notFound.templates" />
            </Link>
          </div>
        }
      />
    </div>
  );
}
