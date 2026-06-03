import React from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@shared/components/SEO';
import { Footer } from '@shared/components/layout/Footer';

const LAST_UPDATED  = 'June 3, 2026';
const CONTACT_EMAIL = 'familyroots@aipioneerlab.com';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">{title}</h2>
      <div className="space-y-3 text-gray-700 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

const TOC = [
  ['overview',     '1. Overview'],
  ['data-collect', '2. Information We Collect'],
  ['data-use',     '3. How We Use Information'],
  ['data-share',   '4. Information Sharing'],
  ['retention',    '5. Data Retention'],
  ['security',     '6. Security'],
  ['cookies',      '7. Cookies & Tracking'],
  ['rights',       '8. Your Rights'],
  ['children',     '9. Children\'s Privacy'],
  ['transfers',    '10. International Transfers'],
  ['third-party',  '11. Third-Party Links'],
  ['changes',      '12. Changes to This Policy'],
  ['contact',      '13. Contact Us'],
] as const;

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <SEO
        title="Privacy Policy"
        description="Learn how FamilyRoots collects, uses, and protects your personal data. Your privacy is our priority."
        canonical="/privacy"
      />

      {/* ── Top nav ── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-gray-900 hover:text-brand-600 transition-colors">
            <span className="text-xl">🌳</span> FamilyRoots
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-600 hover:text-brand-700">Sign in →</Link>
        </div>
      </nav>

      <main className="flex-1 py-12 px-4">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

            {/* Sidebar TOC */}
            <aside className="lg:col-span-1 hidden lg:block">
              <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-20">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Contents</p>
                <nav className="space-y-1">
                  {TOC.map(([id, label]) => (
                    <a key={id} href={`#${id}`} className="block text-xs text-gray-600 hover:text-brand-600 py-0.5 hover:underline">
                      {label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-8">

              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                We are committed to protecting your personal data. This policy explains in plain language what we collect, why we collect it, and how you can control it.
              </div>

              <Section id="overview" title="1. Overview">
                <p>
                  AIPioneerLab ("we", "us", "our") operates the FamilyRoots genealogy platform ("Service"). This Privacy Policy describes how we collect, use, store, and share information about you when you use our Service.
                </p>
                <p>
                  FamilyRoots handles two distinct categories of data: (1) your own account and usage data, and (2) genealogical data about family members — including, in some cases, information about living third parties. We treat both categories with the utmost care.
                </p>
                <p>
                  This policy applies to all users worldwide. Where applicable, we comply with the EU General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and other relevant data protection laws.
                </p>
              </Section>

              <Section id="data-collect" title="2. Information We Collect">
                <p><strong>Information you provide directly:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Account data:</strong> Name, email address, and password (stored as a secure hash) when you register</li>
                  <li><strong>Profile data:</strong> Display name, avatar/profile photo, and locale preference</li>
                  <li><strong>Family tree data:</strong> Names, dates, biographical details, relationships, and photos of family members you enter</li>
                  <li><strong>Communications:</strong> Messages you send us via the contact form or email</li>
                </ul>

                <p className="mt-2"><strong>Information collected automatically:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Log data:</strong> IP address, browser type, operating system, referring URL, pages visited, and time/date of requests</li>
                  <li><strong>Usage data:</strong> Actions taken within the Service (e.g., trees created, people added, exports made) — used to improve the platform</li>
                  <li><strong>Device data:</strong> Device type, screen resolution, and browser settings</li>
                  <li><strong>Cookies &amp; local storage:</strong> Session tokens, theme preferences, and cached layout data (see Section 7)</li>
                </ul>

                <p className="mt-2"><strong>Information from third parties:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>OAuth providers:</strong> If you sign in with Google or GitHub, we receive your name, email address, and profile photo from that provider. We do not receive your password.</li>
                </ul>
              </Section>

              <Section id="data-use" title="3. How We Use Information">
                <p>We use the information we collect for the following purposes:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Service delivery:</strong> To create and manage your account, store your family trees, and provide all features of the platform</li>
                  <li><strong>Authentication &amp; security:</strong> To verify your identity, detect fraud, and protect the integrity of the Service</li>
                  <li><strong>Communication:</strong> To send you account-related emails (verification, password reset, invitation notifications). We do not send marketing emails without your explicit consent.</li>
                  <li><strong>Support:</strong> To respond to your enquiries, troubleshoot issues, and provide customer service</li>
                  <li><strong>Improvement:</strong> To analyse usage patterns, fix bugs, and develop new features. We use aggregated, anonymised data for this purpose where possible.</li>
                  <li><strong>Legal compliance:</strong> To comply with applicable laws, regulations, and lawful requests from authorities</li>
                </ul>
                <p>
                  We do not sell your personal data to third parties. We do not use your genealogical data for advertising, profiling, or any purpose other than operating the Service.
                </p>
              </Section>

              <Section id="data-share" title="4. Information Sharing">
                <p>We do not share, sell, rent, or trade your personal information with third parties except in the following limited circumstances:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Service providers:</strong> We work with trusted third-party vendors to operate the Service (e.g., cloud hosting, email delivery, error monitoring). These providers access data only to perform services on our behalf and are contractually bound to protect your data.
                  </li>
                  <li>
                    <strong>Tree collaborators:</strong> Information about you (name, avatar, role) is visible to other members of family trees you have joined or been invited to. You control your own tree's sharing settings.
                  </li>
                  <li>
                    <strong>Legal requirements:</strong> We may disclose information if required by law, court order, or governmental authority, or if we believe disclosure is necessary to protect the rights, property, or safety of AIPioneerLab, our users, or the public.
                  </li>
                  <li>
                    <strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction. We will notify you before your data is transferred and becomes subject to a different privacy policy.
                  </li>
                </ul>
              </Section>

              <Section id="retention" title="5. Data Retention">
                <p>
                  We retain your personal data for as long as your account is active or as needed to provide you with the Service. Specifically:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Account data:</strong> Retained until you delete your account. Deletion is processed within 30 days.</li>
                  <li><strong>Family tree data:</strong> Deleted alongside your account, or earlier if you choose to delete individual trees.</li>
                  <li><strong>Log data:</strong> Retained for up to 90 days for security and debugging purposes.</li>
                  <li><strong>Backup data:</strong> May persist for up to 90 days in encrypted backups before being purged.</li>
                  <li><strong>Legal obligations:</strong> Some data may be retained longer if required by law (e.g., for tax or compliance purposes).</li>
                </ul>
                <p>
                  You can export all your data at any time using the built-in export features, and request deletion by contacting us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>.
                </p>
              </Section>

              <Section id="security" title="6. Security">
                <p>
                  We implement industry-standard technical and organisational measures to protect your data, including:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>TLS/HTTPS encryption for all data in transit</li>
                  <li>AES-256 encryption for sensitive data at rest</li>
                  <li>Secure, bcrypt-hashed password storage</li>
                  <li>JWT-based authentication with short-lived access tokens</li>
                  <li>Role-based access controls limiting data access within the platform</li>
                  <li>Regular security reviews and dependency updates</li>
                </ul>
                <p>
                  While we take every reasonable precaution, no method of transmission over the internet is 100% secure. In the event of a data breach affecting your rights, we will notify you as required by applicable law.
                </p>
              </Section>

              <Section id="cookies" title="7. Cookies & Tracking">
                <p>We use the following types of cookies and local storage:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-3 font-semibold text-gray-700 border-b border-gray-200">Type</th>
                        <th className="text-left p-3 font-semibold text-gray-700 border-b border-gray-200">Purpose</th>
                        <th className="text-left p-3 font-semibold text-gray-700 border-b border-gray-200">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Session token (httpOnly cookie)', 'Authentication — keeps you logged in', 'Until sign-out or expiry'],
                        ['Access token (localStorage)', 'API authentication for in-app requests', '15 minutes'],
                        ['Refresh token (httpOnly cookie)', 'Silent session renewal without re-login', '30–90 days'],
                        ['Theme preference (localStorage)', 'Saves your chosen portal colour theme', 'Persistent'],
                        ['Tree layout cache (localStorage)', 'Stores named canvas layouts per tree', 'Persistent'],
                      ].map(([type, purpose, duration], i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-3 font-medium text-gray-800 border-b border-gray-100">{type}</td>
                          <td className="p-3 text-gray-600 border-b border-gray-100">{purpose}</td>
                          <td className="p-3 text-gray-600 border-b border-gray-100">{duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2">
                  We do not use advertising cookies, third-party tracking pixels, or analytics services that share data with advertisers. You can clear browser storage at any time in your browser settings, but this will sign you out of the Service.
                </p>
              </Section>

              <Section id="rights" title="8. Your Rights">
                <p>
                  Depending on your location, you may have the following rights regarding your personal data:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                  <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data</li>
                  <li><strong>Erasure ("right to be forgotten"):</strong> Request deletion of your personal data</li>
                  <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format (JSON, CSV)</li>
                  <li><strong>Restriction:</strong> Request that we limit how we use your data while a dispute is resolved</li>
                  <li><strong>Objection:</strong> Object to our processing of your data based on legitimate interests</li>
                  <li><strong>Withdraw consent:</strong> Withdraw any consent you have previously given at any time</li>
                </ul>
                <p>
                  To exercise any of these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>. We will respond within 30 days. We may need to verify your identity before fulfilling your request.
                </p>
                <p>
                  Many privacy rights can be exercised directly through the Service: update your profile in Settings, export data via the Export button, or delete your account in Settings → Security.
                </p>
              </Section>

              <Section id="children" title="9. Children's Privacy">
                <p>
                  The Service is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a> and we will delete that information promptly.
                </p>
                <p>
                  Users aged 13–17 must have parental or guardian consent before using the Service. Note that family tree data may include biographical information about minors (e.g., children in a family tree). Please ensure you have appropriate consent before entering such information.
                </p>
              </Section>

              <Section id="transfers" title="10. International Transfers">
                <p>
                  AIPioneerLab operates globally and your data may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from your own.
                </p>
                <p>
                  When transferring data internationally, we take appropriate safeguards to ensure your data is protected in accordance with this policy and applicable law. If you are in the European Economic Area (EEA) or United Kingdom, we ensure such transfers comply with GDPR through appropriate transfer mechanisms including Standard Contractual Clauses.
                </p>
              </Section>

              <Section id="third-party" title="11. Third-Party Links">
                <p>
                  The Service may contain links to third-party websites or services that are not operated by us. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party sites.
                </p>
                <p>
                  We encourage you to review the privacy policies of any third-party services you access through our Service.
                </p>
              </Section>

              <Section id="changes" title="12. Changes to This Policy">
                <p>
                  We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or for other operational reasons. When we make material changes, we will:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Update the "Last updated" date at the top of this page</li>
                  <li>Send you an email notification if you have an account</li>
                  <li>Display a notice within the Service for at least 14 days before changes take effect</li>
                </ul>
                <p>
                  Your continued use of the Service after the effective date constitutes acceptance of the revised policy.
                </p>
              </Section>

              <Section id="contact" title="13. Contact Us">
                <p>
                  If you have any questions, concerns, or requests regarding this Privacy Policy or how we handle your data, please contact our data team:
                </p>
                <div className="bg-gray-50 rounded-lg p-4 mt-2">
                  <p className="font-semibold text-gray-800">AIPioneerLab — Data &amp; Privacy</p>
                  <p className="text-sm mt-1">
                    Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>
                  </p>
                  <p className="text-sm mt-1">
                    Contact form: <Link to="/contact" className="text-brand-600 hover:underline">familyroots.aipioneerlab.com/contact</Link>
                  </p>
                  <p className="text-sm text-gray-500 mt-2">We aim to respond to all privacy-related enquiries within 5 business days.</p>
                </div>
              </Section>

            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
