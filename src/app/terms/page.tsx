import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 29, 2026">
      <section>
        <h2>Using OnRoad Books</h2>
        <p>
          These terms govern your use of OnRoad Books. By creating an account or using the
          service, you agree to these terms. You must be legally able to enter this agreement and
          provide accurate account information.
        </p>
      </section>

      <section>
        <h2>Your account and data</h2>
        <p>
          You are responsible for activity under your account and for keeping access credentials
          secure. You retain ownership of the business information you enter. You grant us the
          limited permission needed to host, process, back up, and display that information so we
          can provide the service.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          You may not misuse the service, attempt unauthorized access, interfere with its
          operation, upload malicious content, violate another person&apos;s rights, or use the
          service for unlawful activity. The public demo is provided for evaluation and is
          read-only.
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
        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, OnRoad Books will not be liable for indirect,
          incidental, special, consequential, or lost-profit damages arising from use of the
          service. Nothing in these terms excludes liability that cannot legally be excluded.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will revise the date above when we do. Continued use after
          an update means you accept the revised terms. Questions can be sent to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
