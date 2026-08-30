import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Billing & Refund Policy" };

export default function BillingPolicyPage() {
  return (
    <LegalPage
      title="Billing & Refund Policy"
      eyebrow="No surprises on the road"
      summary="How the free trial, monthly renewal, cancellation, invoices, and refund requests work."
      updated="August 30, 2026"
    >
      <section>
        <h2>Seven-day trial</h2>
        <p>
          A new account may use OnRoad Books Pro for seven days without a card. The dashboard shows
          the trial end date. We do not automatically charge you merely because the no-card trial
          ends. To become a paid customer, you must affirmatively choose a plan and complete Stripe
          Checkout.
        </p>
      </section>

      <section>
        <h2>Monthly subscriptions</h2>
        <p>
          Paid plans are billed in U.S. dollars each month at the price shown immediately before
          checkout, plus any legally required tax. Stripe securely processes payment and provides
          the receipt or invoice. Your subscription renews each month until canceled.
        </p>
      </section>

      <section>
        <h2>Plan changes</h2>
        <p>
          Available upgrades or downgrades are shown before you confirm them. Stripe may calculate a
          prorated charge or credit when a plan changes during a billing period; the confirmation
          page will show the effect before you approve the change.
        </p>
      </section>

      <section>
        <h2>Cancellation</h2>
        <p>
          You can open Plans &amp; Billing in the dashboard and use the Stripe customer portal to
          cancel. Unless the portal clearly offers and you choose immediate cancellation, access
          continues through the paid period and cancellation stops the next renewal. You can also
          view and download invoices from the portal.
        </p>
      </section>

      <section>
        <h2>Refunds and billing errors</h2>
        <p>
          Subscription charges are generally non-refundable after a billing period begins, except
          where required by law. If you believe a charge was duplicated, unauthorized, or otherwise
          incorrect, contact us promptly. We review requests individually and may issue a full or
          partial refund when appropriate. Approved refunds are returned through Stripe to the
          original payment method; bank processing time is outside our control.
        </p>
      </section>

      <section>
        <h2>Failed payments and account data</h2>
        <p>
          If payment fails, we may limit new bookkeeping entries until billing is resolved. Your
          existing records remain available to read and export under the product&apos;s current access
          rules. We will not charge an export fee to retrieve your own records.
        </p>
      </section>

      <section>
        <h2>Billing support</h2>
        <p>
          Include the account email and invoice number, but never send a full card number, to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
