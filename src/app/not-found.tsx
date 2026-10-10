import Link from "next/link";
import { T } from "@/components/prefs";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">404 · <T k="notFound" /></h1>
      <Link href="/" className="btn-primary mt-6">
        <T k="nav.home" />
      </Link>
    </div>
  );
}
