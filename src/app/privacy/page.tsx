import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 29, 2026">
      <section>
        <h2>Overview</h2>
        <p>
          OnRoad Books provides bookkeeping and financial performance tools for independent
          trucking businesses. This policy explains what information we collect, why we use it,
          and the choices available to you when you use our website and application.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>Account information, including your name, email address, and business name.</li>
          <li>
            If you sign in with Google, the basic profile information Google shares with us,
            such as your verified email address and display name. We do not receive your Google
            password.
          </li>
          <li>
            Business records you choose to enter, including loads, revenue, fuel, expenses,
            settlements, vehicles, and uploaded documents.
          </li>
          <li>
            Technical information needed to operate and protect the service, such as session
            cookies, request logs, device/browser information, and error diagnostics.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use information to authenticate you, provide the bookkeeping features you request,
          calculate business metrics, maintain account security, troubleshoot problems, and
          improve the service. We do not sell your personal information or your business records.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosure</h2>
        <p>
          We use infrastructure and authentication providers, including Google, Supabase, and
          Vercel, to operate the service. They process limited information on our behalf under
          their own security and privacy commitments. We may also disclose information when
          required by law, to protect users or the service, or as part of a business transfer.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          We keep information for as long as needed to provide the service, meet legal
          obligations, resolve disputes, and protect the platform. We use reasonable technical
          and organizational safeguards, but no online system can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You may request access to, correction of, export of, or deletion of your account
          information. You can also revoke OnRoad Books access from your Google Account settings.
          Some records may be retained when required for security, legal, or operational reasons.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions or privacy requests can be sent to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
