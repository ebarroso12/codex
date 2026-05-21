# Healthcare UI Checklist

Use only the sections that match the requested surface.

## Patient Pages

- State service, audience, availability, price/coverage scope when known, and
  next action in plain language.
- Keep trust evidence concrete: provider identity, credentials source, clinic
  contact path, privacy notice access, and what happens after submission.
- Avoid fear-based copy, miracle claims, pseudo-clinical decoration, and promises
  that depend on clinician judgment.

## Scheduling

- Make modality explicit: in-person, video, phone, home visit, or async request.
- Show date, time, time zone when relevant, provider/location, duration if known,
  and reschedule/cancel path.
- Handle no slots, slot conflict, waitlist/callback, loading, and confirmation.
- Confirmation must say what was booked and what happens next.

## Intake And Triage

- Explain why sensitive questions are asked when the reason is not obvious.
- Use progressive grouping for long medical forms and preserve progress when safe.
- Mark required fields, constraints, uploads, consent, and review step clearly.
- If urgency guidance exists, keep it product-approved and highly visible.
  Do not invent clinical thresholds.

## Telehealth And Patient Portal

- Expose session readiness: device requirements, join state, late-provider state,
  reconnect path, support path, and privacy expectations.
- For results and messages, separate unread status, clinical content, actions,
  attachments, timestamps, and clinician attribution.
- Do not expose more patient context than the current user and task require.

## Accessibility

- Use semantic headings, form controls, labels, descriptions, error text, and
  focus management.
- Never rely on color alone for severity, availability, or completion.
- Keep touch targets comfortable, tables responsive, text resizable, and motion
  optional where animation is not essential.
- Test form errors and confirmation with keyboard-only flow.

## Visual Review

- Inspect small phone, large phone, tablet if relevant, and desktop.
- Check long patient/provider names, Portuguese labels, date/time strings, empty
  insurance values, and validation text.
- Prefer real workflow screenshots or browser checks over static assumptions.
