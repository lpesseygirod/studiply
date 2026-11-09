# Studiply data-breach plan

For Lea, as the data controller (GDPR art. 4.7). Not published. It covers what to do if personal data in Studiply is lost, seen or changed by someone who shouldn't have it: who checks what, how the AEPD is told within 72 hours (art. 33), and how affected students are told (art. 34). Keep it next to the other legal texts and read it again when a provider or the app's architecture changes.

## 1. What counts as a breach

A breach is any security incident that leads to personal data being **destroyed, lost, changed, disclosed or accessed** without authorisation, by accident or on purpose. For Studiply, for example:

- someone reads another account's documents, recordings, transcripts or photos (a database rule or a storage path that lets them);
- a secret key (the Supabase service-role key, the JWT secret, an AI service key, Apple's sign-in key, the cron secret) leaks: in git, a log, a screenshot, the app bundle;
- a provider (Supabase, ElevenLabs, Anthropic, Apple) tells us it had an incident affecting our data;
- data is deleted that shouldn't have been and can't be restored (for example, audio removed before its date);
- a lost or stolen laptop that is signed in to the Supabase dashboard.

An incident that touches no personal data (the app is down, a build fails) is not a breach, but write it in the register (§6) if you weren't sure.

## 2. How you would notice

| Where it comes from | What to look at |
|---|---|
| Supabase | Email alerts; the dashboard's Logs (API, Auth, Storage, Edge Functions) for unusual volumes, unknown IPs, errors on `delete-account` or `purge-trash` |
| AI providers | Their notices to the account email; unusual usage or cost in the ElevenLabs and Anthropic consoles, or in `ai_usage` |
| Apple | App Store Connect and developer account emails |
| Students | Messages to [PRIVACY EMAIL] or [SUPPORT EMAIL], App Store reviews ("I saw someone else's notes") |
| The code | A key found in git history or the web bundle (`npm run check:bundle`) |

Supabase, ElevenLabs, Anthropic and Apple are processors: under art. 33.2 and their data processing agreements they must tell you **without undue delay** when they have a breach that affects our data. Their notice starts your 72 hours.

## 3. The first hour: contain it

Write down the time you became aware (the 72 hours start then) and do what applies, in this order:

1. **Stop the leak.** Rotate every key that may be exposed, in each provider's dashboard, then update the Edge Function secrets (`supabase secrets set`) and redeploy:
   - Supabase: the service-role / secret API key and the JWT signing key (this signs everyone out);
   - ElevenLabs and Anthropic API keys;
   - Apple's Sign in with Apple key, and the cron secret used by `purge-trash`.
2. **Close the hole.** Take the affected Edge Function or page offline, or tighten the database rule, before investigating further. A short outage is better than a longer leak.
3. **Revoke sessions** of affected accounts if their sign-in may be compromised.
4. **Keep the evidence.** Export the relevant logs before they rotate; don't delete anything that shows what happened.

## 4. Within 72 hours: assess and notify the AEPD

**Assess**, and write it down:

- what happened, when, and how you found out;
- whose data: how many students, roughly (a database query by user id), and which kinds (account data, recordings, transcripts, notes, photos, AI messages);
- the likely consequences for them (embarrassment, exposure of what they study or say in class, someone else's voices in a recording, phishing with their email);
- what you have done and will do.

**Notify the AEPD** unless the breach is *unlikely to result in a risk* to people (art. 33.1). When in doubt, notify. The AEPD's **Asesora Brecha** tool helps decide. Notify through the AEPD's electronic office (sede electrónica, sedeagpd.gob.es: "Notificación de brechas de datos personales"), with the contents art. 33.3 asks for:

1. the nature of the breach, the categories and approximate number of people and records concerned;
2. your name and contact details ([PRIVACY EMAIL]) as the point of contact;
3. the likely consequences;
4. the measures taken or proposed, including to reduce the harm.

If you don't have everything after 72 hours, notify with what you have and add the rest later (art. 33.4). If you notify after 72 hours, say why.

## 5. Tell the students affected

When the breach is likely to result in a **high risk** to them (art. 34), tell them **without undue delay**: by email to the account's address and in the app. The AEPD's **Comunica-Brecha RGPD** tool helps decide. Use clear, plain language, in English (and Spanish if they wrote in Spanish), with the same points 2–4 above and what they can do themselves (change their password, watch for phishing, delete a recording).

You don't need to tell them individually if the data was unreadable to whoever got it (encrypted with a key that didn't leak), if what you did afterwards means the high risk is no longer likely, or if it would take disproportionate effort. In that last case, publish a notice on the website and in the app instead.

Template:

> **Subject: A security incident affecting your Studiply account**
>
> On [date] we found that [what happened, in one or two sentences]. It affected [which data] of your account. [What it may mean for you.] We have [what you did], and we have told the Spanish data protection authority (AEPD). You can [what they can do]. If you have questions, write to [PRIVACY EMAIL]. We are sorry this happened.

## 6. The breach register (always)

Every breach goes in this register, **even when you don't notify** (art. 33.5): the AEPD can ask to see it. Keep it with your business records, not in the app's repository.

| Became aware (date, time) | What happened | Data and people affected | Consequences | What was done | AEPD notified (date, or why not) | Students told (date, or why not) |
|---|---|---|---|---|---|---|
| | | | | | | |

## 7. Afterwards

Within two weeks, write down what changed so it doesn't happen again (a database test, a check in `npm run check:launch`, a rule in the code), and whether the privacy policy needs updating.

## 8. Contacts

| Who | How |
|---|---|
| You (controller) | [PRIVACY EMAIL] · [PHONE] |
| Your lawyer or gestor | [LAWYER OR GESTOR CONTACT] |
| AEPD | sedeagpd.gob.es · www.aepd.es · 901 100 099 / 91 266 35 17 |
| Supabase | Dashboard → Support (choose the project and "Security") |
| ElevenLabs | [ELEVENLABS SUPPORT CONTACT] |
| Anthropic | [ANTHROPIC SUPPORT CONTACT] |
| Apple | App Store Connect → Contact Us |
