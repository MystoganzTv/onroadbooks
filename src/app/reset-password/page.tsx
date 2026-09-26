import { PasswordRecovery } from "@/components/auth/password-recovery";
import { getAppLocale } from "@/lib/i18n-server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Password recovery · OnRoad Books", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page() {
  return <PasswordRecovery mode="reset" locale={await getAppLocale()} />;
}
