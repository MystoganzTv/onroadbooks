import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      eyebrow="Your information, explained plainly"
      summary="What OnRoad Books collects, why we need it, who helps us process it, and the controls available to you."
      updated="August 30, 2026"
    >
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
            If you sign in with Google, the basic profile information Google shares with us, such
            as your verified email address and display name. We do not receive your Google password.
          </li>
          <li>
            Business records you choose to enter, including loads, revenue, fuel, expenses,
            settlements, vehicles, and uploaded documents.
          </li>
          <li>
            Technical information needed to operate and protect the service, such as session
            cookies, request logs, device/browser information, and error diagnostics.
          </li>
          <li>
            Billing records from Stripe, such as your customer identifier, plan, subscription
            status, invoices, and payment outcome. We do not receive or store your full card number.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use information to authenticate you, provide the bookkeeping features you request,
          calculate business metrics, process subscriptions, maintain account security,
          troubleshoot problems, communicate about the service, and improve it.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosure</h2>
        <p>
          We use infrastructure, authentication, storage, and payment providers, including Google,
          Supabase, Vercel, and Stripe, to operate the service. They process limited information on
          our behalf or as needed to provide their service. We may also disclose information when
          required by law, to protect users or the service, or as part of a business transfer.
        </p>
        <p>
          We do not sell personal information, share it for cross-context behavioral advertising,
          or use trucking ledger records to advertise to you.
        </p>
      </section>

      <section>
        <h2>Google sign-in</h2>
        <p>
          Google sign-in is optional. We request only the basic identity information needed to
          authenticate you: your verified email address, name, and basic profile information made
          available by Google. We do not access Gmail, Drive, contacts, calendars, or your Google
          password. Information received from Google is used only to provide and secure sign-in,
          consistent with the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Cookies and similar technology</h2>
        <p>
          We use essential session and security technology to keep you signed in, complete Google
          authentication, remember display preferences, and protect the application. We do not
          currently use advertising cookies. See our <a href="/cookies">Cookie Policy</a> for details.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          We keep information for as long as needed to provide the service, meet legal obligations,
          resolve disputes, and protect the platform. We use reasonable technical and organizational
          safeguards, including access controls and isolated business workspaces, but no online
          system can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Your choices and privacy rights</h2>
        <p>
          You may request access to, correction of, export of, or deletion of your account
          information. You can also revoke OnRoad Books access from your Google Account settings.
          Some records may be retained when required for security, legal, or operational reasons.
        </p>
        <p>
          Depending on where you live, applicable law may give you additional rights to know,
          access, correct, delete, or obtain a portable copy of personal information, or to appeal a
          decision about a privacy request. We will verify and respond to valid requests as required
          by applicable law and will not discriminate against you for exercising a right.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          OnRoad Books is a business service and is not directed to children under 13. We do not
          knowingly collect personal information from children under 13. Contact us if you believe
          a child has provided information so we can take appropriate action.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as the product or legal requirements change. We will change the
          date above and provide additional notice when a change is material.
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
