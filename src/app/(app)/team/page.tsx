import { redirect } from "next/navigation";

export default async function TeamPage() {
  redirect("/settings?section=access");
}
