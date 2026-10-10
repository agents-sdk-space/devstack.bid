import Link from "next/link";
import { T } from "@/components/prefs";
import { buttonClasses, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState
        icon="🧭"
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
