import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      eyebrow="Essential technology only"
      summary="A clear inventory of the cookies and browser storage OnRoad Books uses to sign you in, protect the app, and remember your choices."
      updated="August 30, 2026"
    >
      <section>
        <h2>What cookies are</h2>
        <p>
          Cookies are small text records a website stores in your browser. Similar browser storage,
          such as local storage, can remember a preference without sending it with every request.
        </p>
      </section>

      <section>
        <h2>Essential session and security cookies</h2>
        <p>
          OnRoad Books uses a signed, HTTP-only session cookie after you log in. It identifies the
          account and business workspace you may access and expires automatically. Supabase may use
          short-lived cookies or equivalent storage during Google OAuth to verify that the login
          response belongs to the browser that started it. These technologies are necessary for the
          requested login and security functions.
        </p>
      </section>

      <section>
        <h2>Preferences</h2>
        <p>
          The landing page may remember your language, and the application may remember display
          choices such as theme and density in local browser storage. These preferences do not
          contain your bookkeeping records and can be cleared from your browser settings.
        </p>
      </section>

      <section>
        <h2>Stripe and external pages</h2>
        <p>
          Checkout and the customer billing portal are hosted by Stripe. Stripe may use cookies on
          its pages for payment processing, fraud prevention, security, and the preferences you
          choose there. Stripe controls those cookies under its own policies.
        </p>
      </section>

      <section>
        <h2>No advertising cookies</h2>
        <p>
          OnRoad Books does not currently place advertising or cross-site tracking cookies. If that
          changes, we will update this policy and provide any consent controls required by law before
          using them.
        </p>
      </section>

      <section>
        <h2>Your controls</h2>
        <p>
          Your browser can delete or block cookies. Blocking essential cookies will prevent account
          login and some security features from working. Questions can be sent to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
