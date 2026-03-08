import nodemailer from "nodemailer";
import { env } from "@/env";

// Singleton transport — reused across all email sends in the worker process.
export const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  // Port 465 = implicit TLS, everything else = STARTTLS (or plain for Mailhog)
  secure: env.SMTP_PORT === 465,
  auth:
    env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
});

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  await transport.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
}
