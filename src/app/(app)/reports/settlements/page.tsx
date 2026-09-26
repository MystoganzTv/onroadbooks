import { redirect } from "next/navigation";

/** Keep existing bookmarks working after removing saved statements from Reports. */
export default function RetiredSavedStatementsPage() {
  redirect("/reports");
}
