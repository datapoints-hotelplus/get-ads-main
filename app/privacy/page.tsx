/**
 * app/privacy/page.tsx
 * Public privacy policy — deliberately NOT behind auth (it is not listed in
 * middleware.ts's matcher), because platform reviewers at TikTok and Meta
 * have to be able to open it without an account.
 *
 * Keep this page factual: it describes what the app actually does today. If
 * the data collected, the platforms integrated, or the sub-processors change,
 * change this page in the same commit.
 */

export const metadata = {
  title: "Privacy Policy — HotelPlus Advertising Analytics",
  description:
    "How HotelPlus collects, stores and uses advertising data in its internal marketing analytics dashboard.",
};

const LAST_UPDATED = "8 September 2026";
const CONTACT_EMAIL = "datapoints@hotelplus.asia";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8 sm:p-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who we are">
          <p>
            This policy covers the internal marketing analytics application operated by
            HotelPlus (&ldquo;we&rdquo;, &ldquo;us&rdquo;). The application is a private,
            internal reporting tool. It is not a consumer product, it is not offered to the
            public, and accounts are created only for our own staff.
          </p>
        </Section>

        <Section title="2. What the application does">
          <p>
            The application collects advertising and account performance data from the
            TikTok and Meta (Facebook) advertising accounts that HotelPlus owns or manages,
            and presents it to our marketing team as reports and dashboards. It exists so
            our team can review campaign performance across several advertising accounts in
            one place, over date ranges of their choosing, without each person needing a
            login to the advertising platforms themselves.
          </p>
        </Section>

        <Section title="3. Data we collect">
          <p className="font-semibold text-gray-900">a. Advertising performance data</p>
          <p>
            Retrieved from the TikTok Marketing API, the TikTok Accounts API and the Meta
            Marketing API, for advertising accounts and business accounts we own or manage.
            This includes spend, impressions, reach, clicks, video views, likes, comments,
            shares, follows, profile views and follower counts, together with campaign, ad
            group and ad names and their creative thumbnails.
          </p>
          <p className="font-semibold text-gray-900">b. Aggregated audience breakdowns</p>
          <p>
            The advertising platforms also report how an audience is composed — by age
            band, gender, province and interest category. These arrive already aggregated
            by the platform. They describe groups, not individuals, and we cannot identify
            any person from them.
          </p>
          <p className="font-semibold text-gray-900">c. Our own users</p>
          <p>
            For the staff who use the application we store a name, an email address, a
            password hash, a role, which advertising accounts each person may view, and a
            log of sign-ins and report activity for security and auditing.
          </p>
        </Section>

        <Section title="4. What we do not collect">
          <p>
            We do not collect personal data about the people who see our advertising, and
            the platform APIs do not expose it to us. We do not collect data belonging to
            advertising accounts we neither own nor manage. We do not use the data to build
            profiles of individuals, and we do not attempt to re-identify anyone from the
            aggregated breakdowns described above.
          </p>
        </Section>

        <Section title="5. How we use the data">
          <p>
            Solely to report on and improve the performance of our own marketing: measuring
            campaigns, comparing periods, allocating budget, and understanding how our paid
            advertising contributes to our accounts&rsquo; overall growth. We do not sell,
            rent, license, or otherwise share this data with third parties, and we do not
            use it for advertising targeting.
          </p>
        </Section>

        <Section title="6. Where the data is stored">
          <p>
            Data is held in a private Supabase (PostgreSQL) database and the application is
            hosted on Vercel. Alert emails are delivered through Resend. These providers
            process data on our behalf as service providers; no one else receives it.
            Access to the database and the hosting environment is restricted to authorised
            HotelPlus personnel.
          </p>
        </Section>

        <Section title="7. Access control">
          <p>
            Every page of the application requires a sign-in. Permissions are granted per
            advertising account per user, so a member of staff sees only the accounts an
            administrator has granted them. Platform access tokens are stored server-side
            and are never exposed to the browser.
          </p>
        </Section>

        <Section title="8. Retention">
          <p>
            Advertising performance data is retained for as long as it remains useful for
            year-on-year comparison, and is deleted when it no longer is. User accounts and
            their activity logs are removed when a person leaves the organisation or their
            access is withdrawn. We remove data sooner on request from the platform whose
            API provided it.
          </p>
        </Section>

        <Section title="9. Platform terms">
          <p>
            Our use of data obtained through the TikTok API for Business and the Meta
            Marketing API is subject to those platforms&rsquo; developer terms and policies.
            We use each scope only for the purpose it was granted, and we understand that
            access may be revoked at any time.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about this policy, or requests concerning data held by this
            application, can be sent to{" "}
            <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="11. Changes">
          <p>
            If what the application collects or how it is used changes, this page is updated
            and the date at the top changes with it.
          </p>
        </Section>
      </div>
    </div>
  );
}
