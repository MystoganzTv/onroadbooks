import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      eyebrow="Your agreement with OnRoad Books"
      summary="The rules that keep your account, your records, and our service working clearly and fairly."
      updated="August 30, 2026"
    >
      <section>
        <h2>Using OnRoad Books</h2>
        <p>
          These terms govern your use of OnRoad Books. By creating an account or using the service,
          you agree to these terms and the policies linked from them.
        </p>
      </section>

      <section>
        <h2>Accounts and eligibility</h2>
        <p>
          You must be at least 18 years old and able to enter a binding agreement. You are
          responsible for accurate account information, safeguarding your credentials, and all
          activity under your account. Tell us promptly if you suspect unauthorized access.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          You retain ownership of the business information you enter. You grant us the limited
          permission needed to host, process, back up, and display that information so we can
          provide and protect the service. You represent that you have the right to provide the
          records and documents you upload.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          You may not misuse the service, attempt unauthorized access, interfere with its
          operation, upload malicious content, violate another person&apos;s rights, or use the service
          for unlawful activity. The public demo is provided for evaluation and is read-only.
        </p>
        <p>
          Additional restrictions appear in our <a href="/acceptable-use">Acceptable Use Policy</a>,
          which is part of these terms.
        </p>
      </section>

      <section>
        <h2>Trial, subscriptions, and payment</h2>
        <p>
          New accounts may receive a seven-day trial. Paid plans renew monthly until canceled.
          Before checkout, we show the plan, price, billing frequency, and applicable trial terms.
          Payments are processed by Stripe; OnRoad Books does not receive or store your full card
          number.
        </p>
        <p>
          You may manage or cancel a paid subscription through the billing portal. Cancellation
          normally takes effect at the end of the current paid period unless the checkout or portal
          states otherwise. See our <a href="/billing-policy">Billing &amp; Refund Policy</a> for the
          complete terms.
        </p>
      </section>

      <section>
        <h2>Financial information</h2>
        <p>
          OnRoad Books is a financial management tool, not tax, accounting, investment, or legal
          advice. Calculations are planning estimates based on the information and rates you
          provide. You are responsible for reviewing your records and consulting qualified
          professionals when appropriate.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          We work to keep OnRoad Books reliable and secure, but the service may occasionally be
          interrupted, changed, or discontinued. Features may evolve as the product improves. To
          the extent permitted by law, the service is provided without warranties that it will be
          uninterrupted or error-free.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          The service relies on providers such as Stripe, Google, Supabase, and Vercel. Their own
          terms may apply when you use their features. We are not responsible for third-party
          services outside our control, but we select and configure providers to support the
          operation and security of OnRoad Books.
        </p>
      </section>

      <section>
        <h2>Suspension and termination</h2>
        <p>
          We may restrict or suspend access when reasonably necessary to protect the service,
          comply with law, prevent abuse, or address unpaid charges. You may stop using the service
          and delete your account from Business Settings. Where the product allows it, expired or
          canceled accounts retain read and export access to existing records while writing is
          disabled.
        </p>
      </section>

      <section>
        <h2>Intellectual property</h2>
        <p>
          OnRoad Books, its design, software, branding, and original content belong to OnRoad Books
          or its licensors. These terms grant you a limited, non-exclusive, non-transferable right
          to use the service for your business while your account is permitted to access it. They
          do not transfer ownership of the service or your business records.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, OnRoad Books will not be liable for indirect, incidental,
          special, consequential, or lost-profit damages arising from use of the service. Nothing
          in these terms excludes liability that cannot legally be excluded.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will revise the date above when we do. If a change is
          material, we will provide reasonable notice through the service or by email. Continued
          use after an update takes effect means you accept the revised terms. Questions can be sent
          to <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
