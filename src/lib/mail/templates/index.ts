import { env } from '@/lib/env';
import { escapeHtml } from '@/lib/mail/signature';
import {
  personalize,
  renderTemplate,
  type RenderedEmail,
  type TemplateBody,
  type TemplateVars,
} from '@/lib/mail/templates/base';

export type TemplateKey =
  | 'outreach'
  | 'follow_up'
  | 'meeting_invite'
  | 'lounge_invite'
  | 'nda_sent'
  | 'update'
  | 'thank_you'
  | 'custom';

type Builder = (vars: TemplateVars & { extras?: Record<string, string> }) => TemplateBody;

function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

function siteBase(): string {
  return env.NEXT_PUBLIC_SITE_URL;
}

function investorCtaHref(vars: TemplateVars & { extras?: Record<string, string> }): string {
  return vars.extras?.investorLink ?? `${siteBase()}/`;
}

const outreach: Builder = (vars) => {
  const name = vars.firstName ?? 'there';
  const firmLine = vars.extras?.firmName
    ? `Given your work at ${vars.extras.firmName}, I thought this might be interesting to you.`
    : 'Based on your past work with hospitality and early-stage SaaS, I thought this might be interesting to you.';
  const heading = `Hi ${name} — should we talk about OotaOS?`;
  const bodyText = personalize(
    `Hi {{firstName}},

I am building OotaOS — an AI-native operating system for the restaurant and hospitality industry. ${firmLine}

We are raising our seed round and I would love to show you the 30-second demo and the data room. Your personalized walkthrough is at the link below — it takes less than 15 minutes to skim and no login is required.

Would you have time in the next two weeks for a short call?`,
    vars,
  );
  const bodyHtml = nl2br(bodyText);
  return {
    subject: `${vars.founder.companyName ?? 'OotaOS'} × ${name} — a quick intro`,
    heading,
    bodyHtml,
    bodyText,
    cta: {
      label: 'See your Wonderland',
      href: investorCtaHref(vars),
    },
  };
};

const followUp: Builder = (vars) => {
  const name = vars.firstName ?? 'there';
  const bodyText = personalize(
    `Hi {{firstName}},

Circling back on my previous note — I know intro emails can slip. If it helps, the 2-minute pitch and updated metrics are both live at your personalized link below.

Happy to answer anything async, and WhatsApp is sometimes easier than email.`,
    vars,
  );
  return {
    subject: `Following up — ${vars.founder.companyName ?? 'OotaOS'}`,
    heading: `Quick follow-up, ${name}`,
    bodyHtml: nl2br(bodyText),
    bodyText,
    cta: {
      label: 'Open the 2-minute pitch',
      href: investorCtaHref(vars),
    },
  };
};

const meetingInvite: Builder = (vars) => {
  const when = vars.extras?.whenLine ?? 'A time that works for you';
  const agenda = vars.extras?.agenda ?? '30-minute intro: product demo, traction, ask.';
  const bodyText = personalize(
    `Hi {{firstName}},

Confirming our meeting.

When: ${when}
Agenda: ${agenda}

I will send a calendar invite shortly. If you prefer a different slot, just reply with two that work and I will take the earliest.`,
    vars,
  );
  return {
    subject: 'Our OotaOS meeting — confirmed',
    heading: 'Meeting confirmed',
    bodyHtml: nl2br(bodyText),
    bodyText,
  };
};

const loungeInvite: Builder = (vars) => {
  const loungeUrl = vars.extras?.investorLink ?? vars.extras?.loungeUrl ?? `${siteBase()}/lounge`;
  const bodyText = personalize(
    `Hi {{firstName}},

The OotaOS data room is ready for you. Sign a 60-second NDA and you will see the deck, cap table, traction dashboard, and a calendar to book me.

Everything you download is watermarked — please keep it private.`,
    vars,
  );
  return {
    subject: 'Your access to the OotaOS data room',
    heading: 'Your lounge is ready',
    bodyHtml: nl2br(bodyText),
    bodyText,
    cta: { label: 'Enter the lounge', href: loungeUrl },
  };
};

const ndaSent: Builder = (vars) => {
  const bodyText = personalize(
    `Hi {{firstName}},

Thanks for signing the NDA. Your data room access is live — you can return any time with the same link. Everything you open or download will show your name as a watermark.

If anything looks broken, reply to this email and I will fix it the same day.`,
    vars,
  );
  return {
    subject: 'NDA signed — welcome to the OotaOS data room',
    heading: 'You are in',
    bodyHtml: nl2br(bodyText),
    bodyText,
    cta: {
      label: 'Open the data room',
      href: investorCtaHref(vars),
    },
  };
};

const update: Builder = (vars) => {
  const highlight =
    vars.extras?.highlight ?? 'A quiet but productive month — scroll for the numbers.';
  const bodyText = personalize(
    `Hi {{firstName}},

Monthly update from ${vars.founder.companyName ?? 'OotaOS'}:

${highlight}

Full update with metrics, product shots, and the ask is in the data room.`,
    vars,
  );
  return {
    subject: `${vars.founder.companyName ?? 'OotaOS'} update — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    heading: 'This month at OotaOS',
    bodyHtml: nl2br(bodyText),
    bodyText,
    cta: {
      label: 'Read the full update',
      href: investorCtaHref(vars),
    },
  };
};

const thankYou: Builder = (vars) => {
  const bodyText = personalize(
    `Hi {{firstName}},

Thank you for the time today — it was genuinely useful.

I will send the follow-ups we discussed by end of day. If anything was unclear or you want to bring a partner into the next conversation, let me know.`,
    vars,
  );
  return {
    subject: 'Thank you — next steps',
    heading: 'Thank you for today',
    bodyHtml: nl2br(bodyText),
    bodyText,
  };
};

const custom: Builder = (vars) => {
  const subject = vars.extras?.subject ?? 'A note from OotaOS';
  const heading = vars.extras?.heading ?? '';
  const body = vars.extras?.body ?? '';
  const bodyText = personalize(body, vars);
  return {
    subject: personalize(subject, vars),
    heading: heading ? personalize(heading, vars) : (undefined as unknown as string),
    bodyHtml: nl2br(bodyText),
    bodyText,
  };
};

const BUILDERS: Record<TemplateKey, Builder> = {
  outreach,
  follow_up: followUp,
  meeting_invite: meetingInvite,
  lounge_invite: loungeInvite,
  nda_sent: ndaSent,
  update,
  thank_you: thankYou,
  custom,
};

export function renderByKey(
  key: TemplateKey,
  vars: TemplateVars & { extras?: Record<string, string> },
): RenderedEmail {
  const body = BUILDERS[key](vars);
  return renderTemplate(body, vars);
}

export const TEMPLATE_KEYS: readonly TemplateKey[] = [
  'outreach',
  'follow_up',
  'meeting_invite',
  'lounge_invite',
  'nda_sent',
  'update',
  'thank_you',
  'custom',
] as const;

export function templateMeta(key: TemplateKey): { label: string; description: string } {
  switch (key) {
    case 'outreach':
      return { label: 'Cold outreach', description: 'First-touch introduction to a new investor.' };
    case 'follow_up':
      return { label: 'Follow-up', description: 'Gentle nudge after an unreplied outreach.' };
    case 'meeting_invite':
      return { label: 'Meeting invite', description: 'Confirm a scheduled meeting.' };
    case 'lounge_invite':
      return { label: 'Lounge invite', description: 'Share the data room link.' };
    case 'nda_sent':
      return { label: 'NDA welcome', description: 'Confirmation after NDA signing.' };
    case 'update':
      return { label: 'Investor update', description: 'Recurring monthly update.' };
    case 'thank_you':
      return { label: 'Thank you', description: 'Post-meeting thank-you.' };
    case 'custom':
      return { label: 'Custom', description: 'Compose freely within the branded shell.' };
  }
}
