/** Shared shell for every transactional email. Inline CSS only - mail clients. */
export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailFacts {
  [label: string]: string | null | undefined;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface LayoutOptions {
  title: string;
  preheader: string;
  greeting: string;
  intro: string;
  facts?: EmailFacts;
  quote?: string | null;
  action?: EmailAction | null;
  footerNote?: string;
}

const BRAND = '#B31E33';
const INK = '#1A1D23';
const MUTED = '#6B7280';
const BORDER = '#E3E4E8';

export function renderEmail(options: LayoutOptions): { html: string; text: string } {
  const facts = Object.entries(options.facts ?? {}).filter(([, value]) => Boolean(value));

  const factRows = facts
    .map(
      ([label, value]) =>
        '<tr>' +
        '<td style="padding:6px 0;color:' +
        MUTED +
        ';font-size:13px;width:150px;vertical-align:top;">' +
        escapeHtml(label) +
        '</td>' +
        '<td style="padding:6px 0;color:' +
        INK +
        ';font-size:13px;font-weight:600;">' +
        escapeHtml(String(value)) +
        '</td>' +
        '</tr>',
    )
    .join('');

  const quoteBlock = options.quote
    ? '<div style="margin:20px 0;padding:14px 16px;background:#F8FAFC;border-left:3px solid ' +
      BRAND +
      ';border-radius:4px;color:' +
      INK +
      ';font-size:14px;line-height:1.6;">' +
      escapeHtml(options.quote) +
      '</div>'
    : '';

  const actionBlock = options.action
    ? '<div style="margin:28px 0 8px;">' +
      '<a href="' +
      options.action.url +
      '" style="display:inline-block;background:' +
      BRAND +
      ';color:#FFFFFF;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600;">' +
      escapeHtml(options.action.label) +
      '</a></div>'
    : '';

  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' +
    escapeHtml(options.title) +
    '</title></head>' +
    '<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">' +
    '<span style="display:none;max-height:0;overflow:hidden;opacity:0;">' +
    escapeHtml(options.preheader) +
    '</span>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ' +
    BORDER +
    ';border-radius:10px;overflow:hidden;">' +
    '<tr><td style="padding:20px 28px;border-bottom:1px solid ' +
    BORDER +
    ';">' +
    '<span style="font-size:15px;font-weight:700;color:' +
    BRAND +
    ';letter-spacing:0.12em;">CARE</span>' +
    '<span style="font-size:12px;color:' +
    MUTED +
    ';margin-left:10px;">Workflow</span>' +
    '</td></tr>' +
    '<tr><td style="padding:28px;">' +
    '<h1 style="margin:0 0 6px;font-size:19px;line-height:1.35;color:' +
    INK +
    ';font-weight:700;">' +
    escapeHtml(options.title) +
    '</h1>' +
    '<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:' +
    MUTED +
    ';">' +
    escapeHtml(options.greeting) +
    ' ' +
    escapeHtml(options.intro) +
    '</p>' +
    (factRows
      ? '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid ' +
        BORDER +
        ';border-bottom:1px solid ' +
        BORDER +
        ';padding:6px 0;margin:6px 0;">' +
        factRows +
        '</table>'
      : '') +
    quoteBlock +
    actionBlock +
    '</td></tr>' +
    '<tr><td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid ' +
    BORDER +
    ';color:' +
    MUTED +
    ';font-size:12px;line-height:1.5;">' +
    escapeHtml(options.footerNote ?? 'You are receiving this because you are involved in this task. Manage your notification preferences in the CARE workflow platform.') +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  const textFacts = facts.map(([label, value]) => label + ': ' + value).join('\n');
  const text = [
    options.title,
    '',
    options.greeting + ' ' + options.intro,
    textFacts ? '\n' + textFacts : '',
    options.quote ? '\n"' + options.quote + '"' : '',
    options.action ? '\n' + options.action.label + ': ' + options.action.url : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
