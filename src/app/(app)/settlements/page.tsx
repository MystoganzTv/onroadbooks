import { redirect } from "next/navigation";

/** Retired owner statements: keep old bookmarks useful without exposing actions. */
export default function SettlementsPage() {
  redirect("/reports");
}
