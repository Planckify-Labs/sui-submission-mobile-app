# Distribution discipline (TWV-2026-065)

**Spec reference:** `wallet-security-vulnerabilities-spec.md` TWV-2026-065,
§7, §9. Companion: TWV-2026-020 (app-store impersonation watch), task 37.

This file is the **public** runbook. The full version — with takedown
contacts, trademark-registration status, monitoring queries keyed to
specific brand strings, and legal escalation ladders — lives in the
private ops folder. That document is not committed here.

## 1. Distribution channels we sign

Users install TakumiPay only through:

1. **Apple App Store** — published under team `cstralpt`,
   bundle `com.planckify.takumiwallet`.
2. **Google Play Store** — published under
   `com.planckify.takumiwallet`, using Play App Signing (Google holds
   the app-signing key; our upload key is rotated per policy).
3. **Internal beta channels** (TestFlight / Play Internal testing) —
   for engineering and QA only; never surfaced as "official" to end
   users.

No third-party app store. No direct APK/IPA downloads from our
website. No desktop companion today.

### Future desktop companion (design gate)

Any desktop component that ships in the future MUST:

- Distribute as a signed `.dmg` (Apple Developer ID notarised),
  signed `.pkg`, or Windows MSIX through the Microsoft Store.
- Never be offered as a plain `.exe` / `.zip` from a website download
  button.
- Pin the desktop-signer identity inside the mobile app so pairing
  verifies a known-good signer certificate rather than trusting
  whatever the user ran.
- Be reviewed against this runbook before the first public build.

## 2. What is published in-app

The About screen (`app/about.tsx`, populated by
`constants/about.ts`) renders:

- Apple App Store URL, Google Play URL, Website URL, verified socials.
- iOS Bundle ID and Android Package.
- Expected SHA-256 fingerprint of the signing certificate for the
  current build profile.
- Version, build number, commit hash.
- The verbatim warning: "Never download a TakumiPay desktop or
  browser component from search results..."

Users can verify the fingerprint against:

- **iOS:** Settings → General → About (on a shipped build the OS
  reports the distribution cert's SHA-256 under "Provisioning /
  Certificates" via MDM or via `security cms -D` on an exported
  `.mobileprovision`).
- **Android:** Play Store listing ("App info → Signing certificate
  fingerprint" in Play Console-linked surfaces), or `keytool
  -printcert -jarfile` against the APK / bundle.

## 3. Fingerprint update workflow

- `constants/about.ts` ships placeholder SHA-256s until the
  production signing pipeline lands.
- Real fingerprints are added by a security-team-approved PR that
  references the source (Apple Developer account / Play Console
  screenshot attached to the PR description).
- Changing a fingerprint post-launch requires a new security-team
  review *and* a release note explaining why the cert rotated,
  because users are trained to treat mismatches as "not the real app".
- Never commit a private key to the repo. Code-signing private keys
  live in KMS / the Apple Developer portal / Play App Signing; CI
  has sign-only access.

## 4. Brand / impersonation monitoring (weekly)

Cross-link: task 37 (TWV-2026-020). The full query list lives in the
private ops folder. Public summary:

- Search engines: Google, Bing, DuckDuckGo — query "takumi wallet",
  "takumiai wallet", "takumi.ai download", "takumi wallet app"
  weekly. Log impersonator domains.
- App stores: search "takumi", "takumiwallet", "tak.um" across
  Apple App Store and Google Play weekly. Report impersonators via
  each store's legal intake.
- Social platforms: X, TikTok, YouTube, Reddit — watch for fake
  promo accounts. Report impersonator accounts with the trademark
  intake.
- GitHub / other code hosts: look for repos claiming to be the
  Takumi source when they are not.

Findings go to the shared ops tracker. A finding becomes a takedown
ticket if:

- An installer, APK, or DMG is offered.
- A paid ad is running.
- The account / site is collecting seed phrases, private keys, or
  "support PIN" codes.

## 5. Hardware-pairing UX cross-link

When HW pairing ships (task 58 / TWV-2026-046), the pairing UX must
warn the user if they attempt to pair over a channel (BLE name, USB
device string, QR source domain) that does not match a previously-
seen or allowlisted channel. The warning nudges to the official
onboarding flow; it does not silently trust first-use.

## 6. Runbook location

- **Public excerpt:** this file.
- **Private full runbook:** internal ops folder, access-controlled.
  Includes specific monitoring queries, takedown contacts, trademark
  registration status per jurisdiction, legal escalation ladder.

When you add or change a monitoring query, takedown contact, or
trademark status, update the private runbook first. Only the
non-sensitive shape of the process belongs in this public file.

## 7. Acceptance status

- [x] `README.md` has an official-links section.
- [x] `app/about.tsx` exists and shows Bundle ID, Package, SHA-256,
      version, build, commit.
- [x] `constants/about.ts` centralises the published values; updates
      require security-team PR review.
- [x] Monitoring runbook exists (this file + private ops folder
      pointer).
- [x] Desktop-companion distribution pre-implementation notes captured.
