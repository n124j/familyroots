import React from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@shared/components/SEO';
import { Footer } from '@shared/components/layout/Footer';

const LAST_UPDATED = 'June 3, 2026';
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
  ['acceptance',     '1. Acceptance of Terms'],
  ['service',        '2. Description of Service'],
  ['accounts',       '3. User Accounts'],
  ['content',        '4. User Content & Data'],
  ['living',         '5. Living Individuals Policy'],
  ['acceptable-use', '6. Acceptable Use'],
  ['ip',             '7. Intellectual Property'],
  ['privacy',        '8. Privacy'],
  ['disclaimers',    '9. Disclaimers'],
  ['liability',      '10. Limitation of Liability'],
  ['indemnification','11. Indemnification'],
  ['termination',    '12. Termination'],
  ['changes',        '13. Changes to Terms'],
  ['governing-law',  '14. Governing Law'],
  ['contact',        '15. Contact'],
] as const;

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <SEO
        title="Terms & Conditions"
        description="Read the FamilyRoots Terms and Conditions to understand your rights and obligations when using our genealogy platform."
        canonical="/terms"
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms &amp; Conditions</h1>
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

              <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 text-sm text-brand-800">
                Please read these Terms &amp; Conditions carefully before using FamilyRoots. By accessing or using our service, you agree to be bound by these terms.
              </div>

              <Section id="acceptance" title="1. Acceptance of Terms">
                <p>
                  These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User", "you") and AIPioneerLab ("Company", "we", "us") governing your use of the FamilyRoots platform, including the website at familyroots.aipioneerlab.com and all related services (collectively, the "Service").
                </p>
                <p>
                  By creating an account, accessing, or using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and our <Link to="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>. If you do not agree, you must not use the Service.
                </p>
                <p>
                  You must be at least 13 years of age to use the Service. If you are under 18, you represent that you have your parent's or legal guardian's permission.
                </p>
              </Section>

              <Section id="service" title="2. Description of Service">
                <p>
                  FamilyRoots is a collaborative genealogy platform that enables users to build, visualise, and share family trees. Key features include:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Family tree creation and management with multiple generations</li>
                  <li>Interactive visualisation including fan charts, pedigree views, and node-based layouts</li>
                  <li>Collaborative editing with role-based access controls (Owner, Admin, Editor, Viewer)</li>
                  <li>Person profiles with biographical information and photo uploads</li>
                  <li>Global search across trees and members</li>
                  <li>Data export in multiple formats (PDF, CSV, .frt, ZIP)</li>
                  <li>Activity logging and audit trails</li>
                </ul>
                <p>
                  We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice. We are not liable to you or any third party for any modification, suspension, or discontinuation.
                </p>
              </Section>

              <Section id="accounts" title="3. User Accounts">
                <p>
                  To access most features of FamilyRoots, you must create an account. When registering, you agree to:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Provide accurate, current, and complete information</li>
                  <li>Maintain and promptly update your account information</li>
                  <li>Keep your password confidential and not share it with others</li>
                  <li>Be responsible for all activity that occurs under your account</li>
                  <li>Notify us immediately of any unauthorised use at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a></li>
                </ul>
                <p>
                  You may not create more than one account per person, or create an account on behalf of someone else without their explicit consent. We reserve the right to refuse registration or cancel accounts at our discretion.
                </p>
                <p>
                  <strong>Account Security:</strong> You are fully responsible for maintaining the confidentiality of your login credentials. AIPioneerLab will not be liable for any loss or damage arising from your failure to protect your account credentials.
                </p>
              </Section>

              <Section id="content" title="4. User Content & Data">
                <p>
                  <strong>Ownership:</strong> You retain full ownership of all family tree data, biographical information, photos, and other content you upload or create on FamilyRoots ("User Content"). We do not claim any intellectual property rights over your User Content.
                </p>
                <p>
                  <strong>Licence to us:</strong> By uploading User Content, you grant AIPioneerLab a limited, non-exclusive, royalty-free licence to store, process, display, and transmit your User Content solely for the purpose of operating and improving the Service. This licence terminates when you delete your content or account.
                </p>
                <p>
                  <strong>Accuracy:</strong> You are solely responsible for the accuracy, quality, and legality of your User Content. We do not verify the historical or biographical accuracy of information entered into the Service.
                </p>
                <p>
                  <strong>Backup:</strong> While we take reasonable precautions to protect your data, we recommend exporting and maintaining your own backups using the built-in export features (PDF, CSV, .frt, ZIP).
                </p>
              </Section>

              <Section id="living" title="5. Living Individuals Policy">
                <p>
                  FamilyRoots may be used to record information about living people. Given the sensitive nature of personal data, you agree to the following when adding living individuals to your family trees:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Obtain appropriate consent from living individuals before recording their personal information</li>
                  <li>Not share or make accessible the private details of living individuals without their consent</li>
                  <li>Use the "Viewer" or restricted roles when sharing trees containing living person data with others</li>
                  <li>Remove any living individual's data promptly if requested by that individual</li>
                  <li>Comply with applicable data protection laws in your jurisdiction (including GDPR, CCPA, or equivalent legislation)</li>
                </ul>
                <p>
                  AIPioneerLab is not responsible for any privacy violations resulting from your failure to comply with this section. You indemnify us against any claims arising from such violations.
                </p>
              </Section>

              <Section id="acceptable-use" title="6. Acceptable Use">
                <p>You agree not to use the Service to:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Violate any applicable laws or regulations</li>
                  <li>Upload or share content that is defamatory, obscene, fraudulent, or violates third-party rights</li>
                  <li>Impersonate another person or misrepresent your affiliation with any entity</li>
                  <li>Attempt to gain unauthorised access to any part of the Service or its servers</li>
                  <li>Introduce malware, viruses, or other harmful code</li>
                  <li>Scrape, crawl, or harvest data from the Service without written permission</li>
                  <li>Circumvent any access controls, rate limits, or security mechanisms</li>
                  <li>Resell, sublicense, or commercially exploit the Service without our written consent</li>
                  <li>Use the Service to harass, intimidate, or harm any individual</li>
                </ul>
                <p>
                  Violation of this section may result in immediate account suspension or termination without notice.
                </p>
              </Section>

              <Section id="ip" title="7. Intellectual Property">
                <p>
                  The FamilyRoots platform, including its software, design, trademarks, logos, and documentation, is owned by AIPioneerLab and protected by intellectual property laws. Nothing in these Terms transfers any such rights to you.
                </p>
                <p>
                  You are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Service solely for personal, non-commercial genealogy purposes in accordance with these Terms.
                </p>
                <p>
                  If you believe your intellectual property rights have been infringed by content on the platform, please contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a> with a description of the alleged infringement.
                </p>
              </Section>

              <Section id="privacy" title="8. Privacy">
                <p>
                  Your privacy is important to us. Our collection and use of your personal information is governed by our <Link to="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>, which is incorporated into these Terms by reference.
                </p>
                <p>
                  By using the Service, you consent to the collection and use of your data as described in the Privacy Policy.
                </p>
              </Section>

              <Section id="disclaimers" title="9. Disclaimers">
                <p>
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY LAW, AIPIONEERLAB DISCLAIMS ALL WARRANTIES INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
                <p>
                  We do not warrant that: (a) the Service will be uninterrupted or error-free; (b) defects will be corrected; (c) the Service is free of viruses or other harmful components; or (d) the accuracy or completeness of any information on the Service.
                </p>
                <p>
                  FamilyRoots is a tool to assist in genealogical research. We make no representations as to the historical accuracy of information entered by users.
                </p>
              </Section>

              <Section id="liability" title="10. Limitation of Liability">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL AIPIONEERLAB, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your access to or use of (or inability to access or use) the Service</li>
                  <li>Any conduct or content of any third party on the Service</li>
                  <li>Any content obtained from the Service</li>
                  <li>Unauthorised access, use, or alteration of your transmissions or content</li>
                </ul>
                <p>
                  In jurisdictions that do not allow the exclusion of certain warranties or limitation of liability, our liability shall be limited to the fullest extent permitted by law.
                </p>
              </Section>

              <Section id="indemnification" title="11. Indemnification">
                <p>
                  You agree to indemnify, defend, and hold harmless AIPioneerLab and its affiliates, officers, agents, employees, and partners from any claim, demand, loss, damage, or expense (including reasonable legal fees) arising out of or related to: (a) your use of the Service; (b) your User Content; (c) your violation of these Terms; or (d) your violation of any rights of a third party.
                </p>
              </Section>

              <Section id="termination" title="12. Termination">
                <p>
                  <strong>By you:</strong> You may delete your account at any time through the Settings page. Upon deletion, your personal data and family trees will be removed from our active systems within 30 days, subject to any legal retention obligations.
                </p>
                <p>
                  <strong>By us:</strong> We may suspend or terminate your account immediately, without prior notice, if we believe you have violated these Terms or for any other reason at our discretion. We will notify you by email where reasonably practicable.
                </p>
                <p>
                  Upon termination, all rights granted under these Terms immediately cease. Provisions that by their nature should survive termination (including Sections 4, 7, 9, 10, and 11) shall survive.
                </p>
              </Section>

              <Section id="changes" title="13. Changes to Terms">
                <p>
                  We may update these Terms from time to time. When we make material changes, we will notify you by email or by displaying a prominent notice within the Service at least 14 days before the changes take effect.
                </p>
                <p>
                  Your continued use of the Service after the effective date of the revised Terms constitutes your acceptance of the changes. If you do not agree to the new Terms, you must stop using the Service.
                </p>
                <p>
                  The most current version of the Terms will always be available at this page. We encourage you to review this page periodically.
                </p>
              </Section>

              <Section id="governing-law" title="14. Governing Law">
                <p>
                  These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising under these Terms shall first be subject to good-faith negotiation between the parties before being submitted to the appropriate courts or arbitration.
                </p>
                <p>
                  If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary so that these Terms will otherwise remain in full force and effect.
                </p>
              </Section>

              <Section id="contact" title="15. Contact">
                <p>
                  If you have any questions about these Terms, please contact us:
                </p>
                <div className="bg-gray-50 rounded-lg p-4 mt-2">
                  <p className="font-semibold text-gray-800">AIPioneerLab — FamilyRoots Team</p>
                  <p className="text-sm mt-1">
                    Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>
                  </p>
                  <p className="text-sm mt-1">
                    Contact form: <Link to="/contact" className="text-brand-600 hover:underline">familyroots.aipioneerlab.com/contact</Link>
                  </p>
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
