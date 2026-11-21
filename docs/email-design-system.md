# Email Design System

The Email Design Studio produces minimalist corporate emails: white background, clean typography, generous spacing and a consistent signature.

## Palette

| Token | Value | Use |
|-------|-------|-----|
| Royal Blue | `#4169E1` | Top rule, button, links, accents |
| Deep Blue | `#1E3A8A` | Headings, organisation name |
| Body text | `#334155` | Paragraphs |
| Muted | `#64748B` | Labels, footer |
| Line | `#E2E8F0` | Borders |
| Tint | `#EFF3FD` | Details panel background |
| White | `#FFFFFF` | Page and card background |

Black and gold are not used. `scripts/validate-templates.js` fails if black (`#000`) or gold values appear. The accent colour can be changed through `config/organisation-profile.json#/branding`; update the templates to match and re-run the validator.

## Typography and layout

- Font stack: `Helvetica, Arial, sans-serif` (safe across email clients).
- Body 15 px / 24 px; heading 24 px / 32 px (22 px on mobile).
- Single 600 px column, fluid to 100% on narrow screens, 32 px side padding (20 px on mobile).
- Table-based layout with inline CSS for reliable rendering across email clients. A `<style>` block adds the `@media (max-width: 620px)` rules for clients that support it.
- Hidden preheader text, a labelled details panel, a single call-to-action button, a sign-off and the shared signature.

## Templates

| Template | Used for |
|----------|----------|
| `grant-enquiry.html` | Grant enquiries |
| `grant-application.html` | Application submissions, accelerator applications |
| `fellowship-enquiry.html` | Fellowship and scholarship enquiries |
| `partnership-outreach.html` | Partnership proposals, meeting requests |
| `application-followup.html` | Follow-ups, thank-you messages |
| `professional-signature.html` | Shared signature partial (injected, not sent alone) |

The mapping from email type to template is in `config/automation-settings.json#/email/emailTypeTemplates` and is checked by the validator.

## Variables

Syntax: `{{name}}` is HTML-escaped; `{{{name}}}` inserts pre-sanitised HTML.

| Variable | Kind | Description |
|----------|------|-------------|
| `subject` | text | Subject; also the `<title>` |
| `preheader` | text | Inbox preview text (hidden in body) |
| `org_name`, `hub_name` | text | Organisation and innovation hub |
| `greeting_name` | text | Recipient name used after "Dear" |
| `opportunity_name`, `funder_name` | text | Programme and funder |
| `deadline_text` | text | Deadline as it should read in the email |
| `reference_line` | text | Internal reference quoted to the recipient |
| `body_paragraphs_html` | raw HTML | `<p>` blocks produced by WF-05 |
| `key_points_html` | raw HTML | A `<ul>` of up to four points |
| `cta_label`, `cta_url` | text | Button label and link (must be a verified domain) |
| `original_sent_date`, `followup_label` | text | Follow-up template only |
| `sender_name`, `sender_title`, `sender_email`, `sender_phone`, `org_website`, `disclaimer_text` | text | Signature |
| `signature_html` | raw HTML | Injected by the renderer from `professional-signature.html` |

Provide an empty string for optional values rather than `null`: a `null` or missing value is reported as unresolved. `examples/sample-template-data.json` supplies every variable.

## Sanitisation

- All `{{text}}` values are escaped. A test confirms a `<script>` payload in `greeting_name` cannot reach the HTML.
- `body_paragraphs_html` and `key_points_html` may contain only `<p>`, `<strong>`, `<em>`, `<ul>`, `<li>`, `<br>` and `<a href>` with `https` links. WF-05 step `sanitise-and-render` enforces this; implement an allow-list sanitiser in the backend function.
- No scripts, forms, remote images or tracking pixels.

## Tone options

| Tone | Guidance |
|------|----------|
| `formal` | Full sentences, no contractions, "Dear Dr / Mr / Ms" where known |
| `warm_professional` | Default; courteous and direct |
| `concise` | Three to five sentences, one request |
| `persuasive` | Leads with fit and evidence; no exaggeration |
| `appreciative` | Thank-you and relationship emails |

British English throughout. No flattery, no promises of outcomes, no unverified statistics.

## Accessibility

- Text contrast: body `#334155` and muted `#64748B` on white meet WCAG AA; the white-on-Royal-Blue button meets AA for large and bold text.
- Semantic headings (`h1`), `role="presentation"` on layout tables, `lang="en"`.
- Every link has descriptive text; the button text states the action.
- The plain-text fallback carries all content and links.

## Plain-text fallback

Generated from the final HTML by `htmlToText()` in `src/lib/render-email.js`: links become `label (url)`, the hidden preheader and styles are removed. Gmail sends both parts as `multipart/alternative`.

## Preview requirements (Email Studio)

The preview must **render the HTML**, not display its source:

```html
<iframe title="Desktop preview" sandbox="" srcdoc="...escaped html..." style="width:700px;height:900px"></iframe>
<iframe title="Mobile preview"  sandbox="" srcdoc="...escaped html..." style="width:375px;height:900px"></iframe>
```

`sandbox=""` disables scripts and same-origin access. `scripts/build-email-preview.js` is a working reference.

## Client compatibility

Table layout and inline styles are designed for broad compatibility, but no automated test here renders in Outlook, Gmail or Apple Mail. Before relying on the templates for important outreach, send test messages to the clients your recipients use and adjust as needed.
