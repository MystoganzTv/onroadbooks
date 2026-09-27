import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Support", description: "Get help with your OnRoad Books account, iPhone app and trucking records." };

export default function SupportPage() {
  return (
    <LegalPage
      title="OnRoad Books Support"
      eyebrow="Help for the road"
      summary="Get help with your account, the iPhone app, or your trucking records. We can assist in English or Spanish."
      updated="September 27, 2026"
      toc={[{ id: "contact", label: "Contact support" }, { id: "access", label: "Account access" }, { id: "records", label: "Records and billing" }, { id: "privacy", label: "Privacy and account deletion" }]}
    >
      <section id="contact">
        <h2>Contact support / Contactar soporte</h2>
        <p>Email <a href="mailto:enrique.padron853@gmail.com">enrique.padron853@gmail.com</a> with a description of the issue, the app version and your device model. If you attach a screenshot, hide private financial or customer information first. Never send your password or verification codes.</p>
        <p>Para recibir ayuda en español, escribe al mismo correo e incluye una descripción del problema, la versión de la app y el modelo del dispositivo. No envíes contraseñas ni códigos de verificación.</p>
      </section>
      <section id="access">
        <h2>Account access</h2>
        <p>For a password account, use <Link href="/forgot-password">password recovery</Link>. If you registered with Google, choose Continue with Google and use the same Google account.</p>
        <p>In the iPhone app, account recovery is available from the sign-in screen. The sample-data option lets you explore the interface without entering your own records.</p>
      </section>
      <section id="records">
        <h2>Records, synchronization and billing</h2>
        <p>The iPhone app and website use the same business records when you sign in to the same account. If a change is missing, check your connection and any pending changes in the app before entering it again.</p>
        <p>For billing or subscription questions, email support. Include the email used for your OnRoad Books account and a description of the charge; do not send a full card number.</p>
      </section>
      <section id="privacy">
        <h2>Privacy and account deletion</h2>
        <p>The business owner can delete the account from Settings in the iPhone app or website. Account deletion also deletes the business records, so export any records you need to keep first. Contact support if you cannot access the account.</p>
        <p>Read our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link> for more information.</p>
      </section>
    </LegalPage>
  );
}
