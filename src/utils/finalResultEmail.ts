import type { DomainType } from '@prisma/client';
import { sendEmail } from '../emailer';

// Final result after the interview (Review 2): selected, or not selected. Same look as the emailer's
// shortlist / rejection emails, sent through the same Gmail settings.

const DOMAIN_LABELS: Record<DomainType, string> = {
  TECHNICAL: 'Technical',
  MANAGEMENT: 'Management',
  DESIGN: 'Design',
  MARKETING: 'Marketing',
  R_AND_D: 'R&D',
  EDITORIAL: 'Editorial',
};

// names come from students' own sign-up forms, so escape them before putting them in HTML
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const wrap = (title: string, headerColor: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 20px; background-color: #f7fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <tr><td style="background-color: ${headerColor}; padding: 24px; text-align: center; color: #ffffff;"><h1 style="margin: 0; font-size: 22px;">Recruitment Portal</h1></td></tr>
    <tr><td style="padding: 28px 24px;">${body}
      <p style="margin-top: 32px; margin-bottom: 4px;">Best regards,</p>
      <p style="margin: 0; font-weight: bold; color: #4a5568;">The Recruitment Team</p>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px; text-align: center; font-size: 12px; color: #718096;">This is an official communication from the Recruitment Team.</td></tr>
  </table>
</body>
</html>`.trim();

export function prepareFinalResultEmail(candidate: { name: string; email: string; domain: DomainType }, selected: boolean) {
  const name = (candidate.name || 'Candidate').trim();
  const domain = DOMAIN_LABELS[candidate.domain] ?? candidate.domain;
  const safeName = escapeHtml(name);
  const safeDomain = escapeHtml(domain);

  if (selected) {
    const subject = `Welcome to the ${domain} team!`;
    const text = `Dear ${name},

Congratulations! After your interview, we are delighted to tell you that you have been selected for the ${domain} domain.

Thank you for the time and effort you put into every round. We will contact you soon with the next steps and onboarding details.

Best regards,
The Recruitment Team`;
    const html = wrap(subject, '#2f855a', `
      <h2 style="color: #2f855a; margin-top: 0;">Congratulations, ${safeName}!</h2>
      <p>After your interview, we are delighted to tell you that you have been <strong>selected</strong> for the <strong>${safeDomain}</strong> domain.</p>
      <p>Thank you for the time and effort you put into every round. We will contact you soon with the next steps and onboarding details.</p>`);
    return { to: candidate.email, subject, text, html };
  }

  const subject = 'Recruitment Application Update';
  const text = `Dear ${name},

Thank you for interviewing with us for the ${domain} domain. We enjoyed getting to know you.

After careful consideration, we will not be moving forward with your application this time. This was a very competitive round, and the decision is not a reflection of your potential.

We sincerely encourage you to apply again in future recruitment cycles.

Warm regards,
The Recruitment Team`;
  const html = wrap(subject, '#4a5568', `
      <h2 style="color: #4a5568; margin-top: 0;">Application Update</h2>
      <p>Dear ${safeName},</p>
      <p>Thank you for interviewing with us for the <strong>${safeDomain}</strong> domain. We enjoyed getting to know you.</p>
      <p>After careful consideration, we will not be moving forward with your application this time. This was a very competitive round, and the decision is not a reflection of your potential.</p>
      <p>We sincerely encourage you to apply again in future recruitment cycles.</p>`);
  return { to: candidate.email, subject, text, html };
}

export async function sendFinalResultEmail(candidate: { name: string; email: string; domain: DomainType }, selected: boolean) {
  const email = prepareFinalResultEmail(candidate, selected);
  return sendEmail({ to: email.to, subject: email.subject, text: email.text, html: email.html });
}
