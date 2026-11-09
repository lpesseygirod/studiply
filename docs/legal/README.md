# Studiply legal texts (drafts)

Drafts for the web pages and in-app links. Have them reviewed by a lawyer or gestor before launch.

| File | Page |
|---|---|
| privacy-policy.md | Privacy Policy |
| terms-of-service.md | Terms of Service |
| refund-policy.md | Refund Policy |
| cookie-policy.md | Cookie Policy |
| legal-notice.md | Legal Notice / Aviso legal (business details) |

## Fill in before publishing

- [YOUR FULL LEGAL NAME], [POSTAL ADDRESS], [TAX ID], [PHONE], [WEBSITE URL]
- [SUPPORT EMAIL], [PRIVACY EMAIL] (they can be the same)
- [DATE] in every file
- [X] days for backups in privacy-policy.md section 7 (check Supabase's backup retention for your plan)
- RevenueCat lines: keep only if you use it
- Free plan / free trial lines in terms-of-service.md and refund-policy.md: keep only what you offer

## Must match the app

- Minimum age is 16 in every file and at sign-up.
- Settings paths named in the texts (Settings → AI & privacy, Your data, Storage & sync, Account) must exist.
- Account deletion and data export must work before launch (Phase 10).
- If you add analytics, crash reporting or marketing emails, update the privacy and cookie policies first.
- Transcription is ElevenLabs (29 Oct 2026): the privacy policy, terms and the consent text name it. "Not used for training" is only true once training is turned off in the ElevenLabs account (Terms and Privacy → Data use) before the first real recording; check whether a DPA is available for the plan.
- **Not true yet: "audio is deleted 3 days after it has been transcribed" (privacy policy section 7).** New lectures are marked `delete_3_days`, but no deletion date is set, the review screen after a recording starts on "Delete manually" and saves that, and nothing deletes audio when a date passes. Build it before launch (BUILD-PLAN 10.1b).
- The data-breach plan (72-hour notice to the AEPD) is in `data-breach-plan.md` (step 10.1b-1).
