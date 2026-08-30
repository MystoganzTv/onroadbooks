import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      eyebrow="Keep the platform safe"
      summary="Simple boundaries that protect every owner-operator, their records, and the infrastructure behind OnRoad Books."
      updated="August 30, 2026"
    >
      <section>
        <h2>Use it for lawful business</h2>
        <p>
          You may not use OnRoad Books to violate law, facilitate fraud, misrepresent financial or
          transportation records, infringe another person&apos;s rights, or assist conduct that creates
          a material risk of harm.
        </p>
      </section>

      <section>
        <h2>Respect accounts and access controls</h2>
        <p>
          Do not access another account or workspace without authorization, probe or bypass security,
          share credentials in a way that defeats plan limits, impersonate another person, or attempt
          to obtain secrets, source code, or non-public data from the service.
        </p>
      </section>

      <section>
        <h2>Do not disrupt the service</h2>
        <p>
          Do not upload malware, run automated traffic that unreasonably burdens the platform,
          interfere with other users, scrape the service, or use the product to distribute spam,
          phishing, or malicious content.
        </p>
      </section>

      <section>
        <h2>Uploaded documents</h2>
        <p>
          Upload only records you have the right to store. Do not upload unlawful content, payment
          card numbers, authentication secrets, or highly sensitive information that the product
          does not request. You remain responsible for the content and accuracy of your records.
        </p>
      </section>

      <section>
        <h2>Enforcement</h2>
        <p>
          We may remove content or restrict access when reasonably necessary to stop a violation,
          protect users or infrastructure, comply with law, or investigate abuse. When practical,
          we will give notice and an opportunity to correct the issue. Serious or repeated violations
          may result in termination.
        </p>
      </section>

      <section>
        <h2>Report abuse</h2>
        <p>
          Report suspected misuse to{" "}
          <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a> with enough
          detail for us to investigate without including unnecessary sensitive information.
        </p>
      </section>
    </LegalPage>
  );
}
