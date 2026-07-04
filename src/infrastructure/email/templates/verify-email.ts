import type { VerificationTemplateData } from '../email.types';

export function verificationTemplate(data: VerificationTemplateData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<tr><td style="padding:48px 40px 32px;text-align:center;background:#18181b">
<h1 style="margin:0;font-size:28px;font-weight:700;color:#fafafa;letter-spacing:-.5px">Recurva</h1>
</td></tr>
<tr><td style="padding:40px 40px 32px">
<h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;letter-spacing:-.3px">Verify your email</h2>
<p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:#52525b">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#52525b">Please verify your email address by clicking the button below. This link expires in 24 hours.</p>
<a href="${data.verificationUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#fff;background:#18181b;border-radius:6px;text-decoration:none">Verify Email</a>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#a1a1aa">If you did not create an account, you can safely ignore this email.</p>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7">
<p style="margin:0;font-size:13px;color:#a1a1aa;text-align:center">Recurva &mdash; Subscription Management Platform</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
