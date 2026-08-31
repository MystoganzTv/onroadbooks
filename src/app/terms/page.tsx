import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

const TOC = [
  { id: "using", label: "Using OnRoad Books" },
  { id: "accounts", label: "Accounts and eligibility" },
  { id: "your-data", label: "Your data" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "billing", label: "Trials, subscriptions & billing" },
  { id: "financial-info", label: "Financial information" },
  { id: "availability", label: "Service availability" },
  { id: "third-party", label: "Third-party services" },
  { id: "suspension", label: "Suspension and termination" },
  { id: "ip", label: "Intellectual property" },
  { id: "liability", label: "Limitation of liability" },
  { id: "changes", label: "Changes and contact" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      eyebrow="Your agreement with OnRoad Books"
      summary="The rules that keep your account, your records, and our service working clearly and fairly. This includes our acceptable use rules and billing terms, covered below."
      updated="August 30, 2026"
      toc={TOC}
    >
      <section id="using">
        <h2>Using OnRoad Books</h2>
        <p>
          These terms govern your use of OnRoad Books. By creating an account or using the service,
          you agree to these terms.
        </p>
      </section>

      <section id="accounts">
        <h2>Accounts and eligibility</h2>
        <p>
          You must be at least 18 years old and able to enter a binding agreement. You are
          responsible for accurate account information, safeguarding your credentials, and all
          activity under your account. Tell us promptly if you suspect unauthorized access.
        </p>
      </section>

      <section id="your-data">
        <h2>Your data</h2>
        <p>
          You retain ownership of the business information you enter. You grant us the limited
          permission needed to host, process, back up, and display that information so we can
          provide and protect the service. You represent that you have the right to provide the
          records and documents you upload.
        </p>
      </section>

      <section id="acceptable-use">
        <h2>Acceptable use</h2>
        <p>
          Simple boundaries that protect every owner-operator, their records, and the
          infrastructure behind OnRoad Books.
        </p>

        <h3>Use it for lawful business</h3>
        <p>
          You may not use OnRoad Books to violate law, facilitate fraud, misrepresent financial or
          transportation records, infringe another person&apos;s rights, or assist conduct that
          creates a material risk of harm. The public demo is provided for evaluation and is
          read-only.
        </p>

        <h3>Respect accounts and access controls</h3>
        <p>
          Do not access another account or workspace without authorization, probe or bypass
          security, share credentials in a way that defeats plan limits, impersonate another
          person, or attempt to obtain secrets, source code, or non-public data from the service.
        </p>

        <h3>Do not disrupt the service</h3>
        <p>
          Do not upload malware, run automated traffic that unreasonably burdens the platform,
          interfere with other users, scrape the service, or use the product to distribute spam,
          phishing, or malicious content.
        </p>

        <h3>Uploaded documents</h3>
        <p>
          Upload only records you have the right to store. Do not upload unlawful content, payment
          card numbers, authentication secrets, or highly sensitive information that the product
          does not request. You remain responsible for the content and accuracy of your records.
        </p>

        <h3>Enforcement</h3>
        <p>
          We may remove content or restrict access when reasonably necessary to stop a violation,
          protect users or infrastructure, comply with law, or investigate abuse. When practical,
          we will give notice and an opportunity to correct the issue. Serious or repeated
          violations may result in termination.
        </p>

        <h3>Report abuse</h3>
        <p>
          Report suspected misuse to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a> with enough
          detail for us to investigate, without including unnecessary sensitive information.
        </p>
      </section>

      <section id="billing">
        <h2>Trials, subscriptions & billing</h2>
        <p>
          How the free trial, monthly renewal, cancellation, invoices, and refund requests work.
        </p>

        <h3>Seven-day trial</h3>
        <p>
          A new account may use OnRoad Books Pro for seven days without a card. The dashboard shows
          the trial end date. We do not automatically charge you merely because the no-card trial
          ends. To become a paid customer, you must affirmatively choose a plan and complete Stripe
          Checkout.
        </p>

        <h3>Monthly subscriptions</h3>
        <p>
          Paid plans are billed in U.S. dollars each month at the price shown immediately before
          checkout, plus any legally required tax. Payments are processed by Stripe, which securely
          provides the receipt or invoice; OnRoad Books does not receive or store your full card
          number. Your subscription renews each month until canceled.
        </p>

        <h3>Plan changes</h3>
        <p>
          Available upgrades or downgrades are shown before you confirm them. Stripe may calculate
          a prorated charge or credit when a plan changes during a billing period; the confirmation
          page will show the effect before you approve the change.
        </p>

        <h3>Cancellation</h3>
        <p>
          You can open Plans &amp; Billing in the dashboard and use the Stripe customer portal to
          cancel. Unless the portal clearly offers and you choose immediate cancellation, access
          continues through the paid period and cancellation stops the next renewal. You can also
          view and download invoices from the portal.
        </p>

        <h3>Refunds and billing errors</h3>
        <p>
          Subscription charges are generally non-refundable after a billing period begins, except
          where required by law. If you believe a charge was duplicated, unauthorized, or otherwise
          incorrect, contact us promptly. We review requests individually and may issue a full or
          partial refund when appropriate. Approved refunds are returned through Stripe to the
          original payment method; bank processing time is outside our control.
        </p>

        <h3>Failed payments and account data</h3>
        <p>
          If payment fails, we may limit new bookkeeping entries until billing is resolved. Your
          existing records remain available to read and export under the product&apos;s current
          access rules. We will not charge an export fee to retrieve your own records.
        </p>

        <h3>Billing support</h3>
        <p>
          Include the account email and invoice number, but never send a full card number, to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>

      <section id="financial-info">
        <h2>Financial information</h2>
        <p>
          OnRoad Books is a financial management tool, not tax, accounting, investment, or legal
          advice. Calculations are planning estimates based on the information and rates you
          provide. You are responsible for reviewing your records and consulting qualified
          professionals when appropriate.
        </p>
      </section>

      <section id="availability">
        <h2>Service availability</h2>
        <p>
          We work to keep OnRoad Books reliable and secure, but the service may occasionally be
          interrupted, changed, or discontinued. Features may evolve as the product improves. To
          the extent permitted by law, the service is provided without warranties that it will be
          uninterrupted or error-free.
        </p>
      </section>

      <section id="third-party">
        <h2>Third-party services</h2>
        <p>
          The service relies on providers such as Stripe, Google, Supabase, and Vercel. Their own
          terms may apply when you use their features. We are not responsible for third-party
          services outside our control, but we select and configure providers to support the
          operation and security of OnRoad Books.
        </p>
      </section>

      <section id="suspension">
        <h2>Suspension and termination</h2>
        <p>
          We may restrict or suspend access when reasonably necessary to protect the service,
          comply with law, prevent abuse, or address unpaid charges. You may stop using the service
          and delete your account from Business Settings. Where the product allows it, expired or
          canceled accounts retain read and export access to existing records while writing is
          disabled.
        </p>
      </section>

      <section id="ip">
        <h2>Intellectual property</h2>
        <p>
          OnRoad Books, its design, software, branding, and original content belong to OnRoad Books
          or its licensors. These terms grant you a limited, non-exclusive, non-transferable right
          to use the service for your business while your account is permitted to access it. They
          do not transfer ownership of the service or your business records.
        </p>
      </section>

      <section id="liability">
        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, OnRoad Books will not be liable for indirect, incidental,
          special, consequential, or lost-profit damages arising from use of the service. Nothing
          in these terms excludes liability that cannot legally be excluded.
        </p>
      </section>

      <section id="changes">
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will revise the date above when we do. If a change is
          material, we will provide reasonable notice through the service or by email. Continued
          use after an update takes effect means you accept the revised terms. Questions can be
          sent to <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
