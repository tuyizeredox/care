import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EMAIL_TEMPLATES, EmailTemplateKey, TaskEmailContext } from './templates';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Email delivery. When `EMAIL_ENABLED=false` (the default in development) the
 * message is logged instead of sent, so the whole notification pipeline can be
 * exercised without an SMTP server.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('mail.enabled');
    const host = this.config.get<string>('mail.host');
    if (!enabled || !host) {
      this.logger.log('Email delivery disabled - messages will be written to the log');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.port') ?? 587,
      secure: this.config.get<boolean>('mail.secure') ?? false,
      auth: this.config.get<string>('mail.user')
        ? {
            user: this.config.get<string>('mail.user'),
            pass: this.config.get<string>('mail.password'),
          }
        : undefined,
    });
    this.logger.log('SMTP transport configured (' + host + ')');
  }

  get isEnabled(): boolean {
    return this.transporter !== null;
  }

  /** Never throws: a failed email must not roll back the business action. */
  async send(input: SendMailInput): Promise<boolean> {
    if (!this.transporter) {
      this.logger.debug('[email:dry-run] to=' + input.to + ' subject="' + input.subject + '"');
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('mail.from'),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return true;
    } catch (error) {
      this.logger.error(
        'Failed to send email to ' + input.to,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  /** Renders a catalogue template and sends it. */
  async sendTemplate(
    template: EmailTemplateKey,
    to: string,
    context: TaskEmailContext,
  ): Promise<boolean> {
    const renderer = EMAIL_TEMPLATES[template] ?? EMAIL_TEMPLATES.SYSTEM;
    const rendered = renderer(context);
    return this.send({ to, ...rendered });
  }
}
