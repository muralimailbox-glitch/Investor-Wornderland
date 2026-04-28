/**
 * Sample renderings of every email kind we send. The admin "Send all
 * sample emails" button fires every entry in `getEmailSamples()` to
 * krish.c@snapsitebuild.com so all templates can be reviewed in one
 * inbox without walking the live workflows.
 *
 * When you add a new email type to the app, add a sample here too —
 * otherwise it won't show up in the test fan-out and a regression in
 * the shared shell could go unnoticed.
 */
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { buildSignature } from '@/lib/mail/signature';
import { renderTemplate } from '@/lib/mail/templates/base';

const SITE = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');

const SAMPLE_FOUNDER = {
  displayName: 'Krish Chimakurthy',
  email: 'info@ootaos.com',
  publicEmail: 'info@ootaos.com',
  whatsappE164: '+61412766366',
  companyName: 'OotaOS',
  companyWebsite: 'https://www.ootaos.com',
  signatureMarkdown: null,
};

const SAMPLE_INVESTOR = {
  firstName: 'Sample',
  lastName: 'Investor',
  email: 'sample.investor@example.com',
  firmName: 'Acme Ventures',
};

export type EmailSample = {
  /** Internal identifier shown in the test summary. */
  id: string;
  /** Human-readable label — shows up in the [SAMPLE] subject prefix. */
  label: string;
  subject: string;
  html: string;
  text: string;
};

export function getEmailSamples(): EmailSample[] {
  const samples: EmailSample[] = [];

  // ── 1. OTP verification code ──────────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Hi ${SAMPLE_INVESTOR.firstName} — your verification code`,
      body: `Enter this code to unlock deeper details about the round. It expires in 10 minutes.\n\nIf you did not request this, you can safely ignore this email.`,
      facts: [['Code', '847291']],
      preFooter: 'For your security, OotaOS will never ask you to share this code.',
    });
    samples.push({
      id: 'otp-verification',
      label: 'OTP verification code',
      subject: `Your OotaOS verification code: 847291`,
      ...r,
    });
  }

  // ── 2. Private invite link ────────────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Your private OotaOS investor lounge`,
      body: `Hi ${SAMPLE_INVESTOR.firstName} — here's your personal link into the OotaOS investor lounge. The data room, founder calendar, and a personal AI concierge (Olivia) live behind it.`,
      cta: [{ label: 'Open the lounge', href: `${SITE}/i/sample-token` }],
      preFooter:
        'Link expires in 30 days; reply to this email if you need a fresh one. Investor calls are the priority Krish builds his week around.',
    });
    samples.push({
      id: 'invite-link',
      label: 'Private invite link',
      subject: `Your OotaOS investor lounge — private link`,
      ...r,
    });
  }

  // ── 3. Meeting booked — investor confirmation ─────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Your OotaOS meeting is booked`,
      body: `Confirmed — the slot below is yours, and you have our full attention for it. Investor conversations sit at the top of Krish's week; everything else flexes around them.\n\nThe Google Meet link is just a placeholder. Krish sits on IST (+5:30) and is happy to fit your usual tooling — Google Calendar, Outlook, Calendly, Zoom, Teams, anything you prefer. Just reply to this email with your own invite for the same slot and that becomes the working meeting.\n\nIf anything changes on your end, reply here and we'll re-book.`,
      facts: [
        ['When', 'Wed 6 May 2026 · 4:00 PM AEST'],
        ['Founder time', 'Wed 6 May 2026 · 11:30 AM IST'],
        ['Google Meet', 'https://meet.google.com/abc-defg-hij'],
        ['Agenda', 'Round mechanics + Sydney GTM'],
      ],
      cta: [
        { label: 'Open the data room', href: `${SITE}/lounge` },
        { label: 'Start a Google Meet', href: 'https://meet.google.com/abc-defg-hij' },
      ],
      preFooter:
        'You are our highest priority — Krish (IST, +5:30) is happy to adapt to whichever calendar tool you usually use. The Google Meet link is only a placeholder; reply with your own invite for the same slot and that becomes the source of truth.',
    });
    samples.push({
      id: 'meeting-booked-investor',
      label: 'Meeting booked — investor',
      subject: `Your OotaOS meeting is booked`,
      ...r,
    });
  }

  // ── 4. Meeting booked — founder/EA notification ───────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Meeting booked — ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
      body: `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName}) just booked a meeting from the lounge calendar.`,
      facts: [
        [
          'Investor',
          `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
        ],
        ['Email', SAMPLE_INVESTOR.email],
        ['Stage', 'nda_signed'],
        ['When', 'Wed 6 May 2026 · 11:30 AM IST'],
        ['Google Meet', 'https://meet.google.com/abc-defg-hij'],
      ],
      cta: [
        { label: 'Open in cockpit', href: `${SITE}/cockpit/meetings` },
        { label: 'Start Google Meet', href: 'https://meet.google.com/abc-defg-hij' },
      ],
    });
    samples.push({
      id: 'meeting-booked-founder',
      label: 'Meeting booked — founder/EA',
      subject: `Meeting booked — ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
      ...r,
    });
  }

  // ── 5. Meeting moved — investor ───────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: 'Your OotaOS meeting was moved',
      body: `Hi ${SAMPLE_INVESTOR.firstName} — apologies for the move. The new time is below, and you have our full attention for it; investor conversations are the priority Krish's week is built around.\n\nA fresh Google Meet link is below as a placeholder. Krish is on IST (+5:30) and happy to use whichever calendar tool you prefer — reply to this email with your own invite for the same slot and we'll treat that as the working meeting.`,
      facts: [
        ['Was', 'Wed 6 May 2026 · 4:00 PM AEST'],
        ['Now', 'Thu 7 May 2026 · 5:30 PM AEST'],
        ['Founder time', 'Thu 7 May 2026 · 1:00 PM IST'],
        ['Google Meet', 'https://meet.google.com/xyz-zzzz-zzz'],
      ],
      cta: [
        { label: 'Open the data room', href: `${SITE}/lounge` },
        { label: 'Start the Google Meet', href: 'https://meet.google.com/xyz-zzzz-zzz' },
      ],
      preFooter:
        'You are our highest priority — Krish (IST, +5:30) is happy to adapt to whichever calendar tool you usually use.',
    });
    samples.push({
      id: 'meeting-moved-investor',
      label: 'Meeting moved — investor',
      subject: 'Your OotaOS meeting moved',
      ...r,
    });
  }

  // ── 6. Meeting cancelled — investor ───────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: 'Your OotaOS meeting was cancelled',
      body: `Hi ${SAMPLE_INVESTOR.firstName} — we had to cancel the slot we'd booked for Wed 6 May 2026 · 4:00 PM AEST.\n\nReason: Founder schedule conflict.\n\nReply to this email or pick a new time at the link below — we'll prioritise the rebook.`,
      cta: [{ label: 'Pick a new time', href: `${SITE}/lounge` }],
      preFooter: 'We send a fresh Google Meet link with every booking.',
    });
    samples.push({
      id: 'meeting-cancelled-investor',
      label: 'Meeting cancelled — investor',
      subject: 'Your OotaOS meeting was cancelled',
      ...r,
    });
  }

  // ── 7. NDA verification code ──────────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Your OotaOS NDA verification code`,
      body: `Hi ${SAMPLE_INVESTOR.firstName} — enter this code on the NDA page to confirm your email and unlock the signing flow. The code expires in 10 minutes.`,
      facts: [['Code', '519284']],
      preFooter: 'For your security, OotaOS will never ask you to share this code.',
    });
    samples.push({
      id: 'nda-otp',
      label: 'NDA verification code',
      subject: 'Your OotaOS NDA verification code: 519284',
      ...r,
    });
  }

  // ── 8. NDA signed — founder/EA notification ───────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `NDA signed — ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName}`,
      body: `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName}) signed the OotaOS mutual NDA. The lounge is unlocked for them and the data room is now reachable.`,
      facts: [
        [
          'Investor',
          `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
        ],
        ['Email', SAMPLE_INVESTOR.email],
        ['Signed at', 'Mon 4 May 2026 · 10:42 AM IST'],
      ],
      cta: [{ label: 'Open in cockpit', href: `${SITE}/cockpit/investors` }],
    });
    samples.push({
      id: 'nda-signed-founder',
      label: 'NDA signed — founder/EA',
      subject: `NDA signed — ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
      ...r,
    });
  }

  // ── 9. Lounge request acknowledgement ─────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: 'We received your request',
      body: `Hi ${SAMPLE_INVESTOR.firstName} — your message landed. Krish reads every investor note personally and will reply within 24 hours, usually faster.`,
      facts: [
        ['Subject', 'Original Q1-2026 financials'],
        ['Sent', 'Mon 4 May 2026 · 11:08 AM IST'],
      ],
      preFooter:
        'You can also reach the founder on WhatsApp +61 412 766 366 for time-sensitive asks.',
    });
    samples.push({
      id: 'lounge-request-ack',
      label: 'Lounge request — investor ack',
      subject: 'We received your request',
      ...r,
    });
  }

  // ── 10. Lounge request — founder/EA notification ─────────────────────
  {
    const r = renderBrandedEmail({
      heading: `New investor request — ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName}`,
      body: `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName}) submitted a request from the lounge. Their message is below.`,
      facts: [
        [
          'Investor',
          `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
        ],
        ['Email', SAMPLE_INVESTOR.email],
        ['Kind', 'more_info'],
        [
          'Message',
          'Could you share the actual cohort retention numbers behind the slide on customer cohort behaviour?',
        ],
      ],
      cta: [{ label: 'Reply in cockpit', href: `${SITE}/cockpit/inbox` }],
    });
    samples.push({
      id: 'lounge-request-founder',
      label: 'Lounge request — founder/EA',
      subject: `New investor request from the lounge`,
      ...r,
    });
  }

  // ── 11. Pre-meeting brief (24h before) ───────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Tomorrow: ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} at 11:30 AM IST`,
      body: `One-page brief on what they care about and where the conversation is likely to go.\n\nLast 3 questions they asked Olivia:\n1. What's the unit economics on the QR ordering side?\n2. How defensible is the AI guardrail layer?\n3. What's the founder's plan for India expansion?\n\nDeck pages re-opened:\n- Slide 14 (Unit economics)\n- Slide 22 (Roadmap H2)\n\nOlivia hasn't been asked about the team page yet — worth surfacing in the call.`,
      facts: [
        [
          'Investor',
          `${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} (${SAMPLE_INVESTOR.firmName})`,
        ],
        ['Stage', 'diligence'],
        ['Warmth', '82'],
        ['Slot', 'Wed 6 May 2026 · 11:30 AM IST'],
      ],
      cta: [{ label: 'Open profile', href: `${SITE}/cockpit/investors/sample-id` }],
    });
    samples.push({
      id: 'pre-meeting-brief',
      label: 'Pre-meeting brief (founder)',
      subject: `Tomorrow: ${SAMPLE_INVESTOR.firstName} ${SAMPLE_INVESTOR.lastName} at 11:30 AM IST`,
      ...r,
    });
  }

  // ── 12. Post-meeting follow-up ───────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: 'Thank you for today',
      body: `Hi ${SAMPLE_INVESTOR.firstName} — appreciated the conversation. Three things you flagged that we'll follow up on:\n\n1. Send the Q1-2026 financials with the cohort retention split.\n2. Intro you to two restaurant operators using OotaOS in Bengaluru.\n3. Share the legal opinion on the IP carve-out.\n\nIf any of that needs to land sooner than 48 hours, reply to this thread or ping me on WhatsApp.`,
      cta: [
        { label: 'Open the data room', href: `${SITE}/lounge` },
        { label: 'WhatsApp Krish', href: 'https://wa.me/61412766366' },
      ],
    });
    samples.push({
      id: 'post-meeting-followup',
      label: 'Post-meeting follow-up (investor)',
      subject: 'Thank you for today',
      ...r,
    });
  }

  // ── 13. Daily digest (founder) ────────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Today: 2 meetings, 3 drafts pending, 1 NDA needs review`,
      body: `Your day at a glance — investor activity over the last 24 hours and what needs your attention.`,
      facts: [
        ['Meetings today', '11:30 AM IST · Sample Investor (Acme Ventures)'],
        ['', '4:00 PM IST · Other Investor (Different Capital)'],
        ['Drafts pending', '3 outreach drafts ready to send'],
        ['NDAs to review', '1 NDA approaching the 2-year anniversary'],
        ['New investor questions', '5 since yesterday morning'],
      ],
      cta: [{ label: 'Open cockpit', href: `${SITE}/cockpit` }],
    });
    samples.push({
      id: 'daily-digest',
      label: 'Daily digest (founder)',
      subject: `OotaOS — 2 meeting(s) today, 3 draft(s) pending`,
      ...r,
    });
  }

  // ── 14. Pipeline reminders (founder) ──────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `Pipeline: 4 actions due`,
      body: `Investors waiting on a next step from you, ordered by warmth.`,
      facts: [
        ['Acme Ventures', 'Awaiting term-sheet response · due today'],
        ['Different Capital', 'Diligence question unanswered · due tomorrow'],
        ['Tier-1 Fund', 'Intro thread cold for 4 days'],
        ['Operator Angel', 'Meeting follow-up not sent'],
      ],
      cta: [{ label: 'Open pipeline', href: `${SITE}/cockpit/pipeline` }],
    });
    samples.push({
      id: 'pipeline-reminders',
      label: 'Pipeline reminders (founder)',
      subject: 'OotaOS pipeline: 4 action(s) due',
      ...r,
    });
  }

  // ── 15. Lounge link expiry warning ────────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `${SAMPLE_INVESTOR.firstName} — your OotaOS lounge link refreshes here`,
      body: `Your magic link to the OotaOS investor lounge will expire in a few days. Use the button below to refresh it without losing any of your prior context — questions, downloads, NDA, all preserved.`,
      cta: [{ label: 'Refresh my link', href: `${SITE}/i/sample-fresh-token` }],
      preFooter:
        'If the button does not work, reply to this email and Krish will send you a fresh link directly.',
    });
    samples.push({
      id: 'link-expiry-warning',
      label: 'Lounge link expiry warning (investor)',
      subject: `${SAMPLE_INVESTOR.firstName} — your OotaOS lounge link refreshes here`,
      ...r,
    });
  }

  // ── 16. NDA expiry digest (founder) ──────────────────────────────────
  {
    const r = renderBrandedEmail({
      heading: `2 NDAs need renewal review`,
      body: `Two NDAs are within 60 days of their 2-year anniversary. Review and decide whether to renew, let lapse, or replace with a fresh document.`,
      facts: [
        ['Acme Ventures', 'Signed 4 May 2024 · expires in 35 days'],
        ['Different Capital', 'Signed 22 May 2024 · expires in 53 days'],
      ],
      cta: [{ label: 'Open NDA list', href: `${SITE}/cockpit/investors` }],
    });
    samples.push({
      id: 'nda-expiry-digest',
      label: 'NDA expiry digest (founder)',
      subject: 'OotaOS — 2 NDA(s) need renewal review',
      ...r,
    });
  }

  // ── 17. Outreach template (templated draft path) ──────────────────────
  {
    const sig = buildSignature(SAMPLE_FOUNDER);
    void sig; // signature is built inside renderTemplate; we just want to exercise the path
    const r = renderTemplate(
      {
        subject: `OotaOS × ${SAMPLE_INVESTOR.firmName} — a quick intro`,
        heading: `Hi ${SAMPLE_INVESTOR.firstName} —`,
        bodyHtml: `<p>Following up — given Acme Ventures' focus on B2B network platforms, I think OotaOS is worth 20 minutes of your time. Two reasons:</p>
<ol>
  <li><strong>The wedge is operating, not point-of-sale.</strong> We replace 6+ tools restaurant operators stitch together today.</li>
  <li><strong>India market timing.</strong> Cloud-first restaurant ops is at the inflection — 80K+ outlets crossing the ₹2 cr revenue threshold this year.</li>
</ol>
<p>Happy to walk through the deck and the unit economics on a 20-min call. Picking three slots for next week below — reply with whichever works.</p>`,
        bodyText: `Hi ${SAMPLE_INVESTOR.firstName} —\n\nFollowing up — given Acme Ventures' focus on B2B network platforms, I think OotaOS is worth 20 minutes of your time...`,
        cta: { label: 'Pick a slot', href: `${SITE}/lounge` },
      },
      {
        founder: SAMPLE_FOUNDER,
        firstName: SAMPLE_INVESTOR.firstName,
        lastName: SAMPLE_INVESTOR.lastName,
        companyName: 'OotaOS',
      },
    );
    samples.push({
      id: 'outreach-template',
      label: 'Outreach template (founder draft)',
      subject: r.subject,
      html: r.html,
      text: r.text,
    });
  }

  return samples;
}
