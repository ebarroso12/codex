---
name: medical-app-ui
description: Build, redesign, and review medical service pages and healthcare app UI. Auto-use when the user asks for pagina, site, tela, app, portal, atendimento, agendamento, triagem, teleconsulta, clinica, medico, paciente, exame, consentimento, or healthcare frontend work where medical clarity, privacy-aware UX, accessibility, and operational trust matter.
---

# Medical App UI

Build healthcare interfaces that are calm, explicit, accessible, privacy-aware,
and usable under stress. Use this skill with the repo's existing frontend stack
and local design conventions.

## Workflow

1. Identify audience, care context, and task:
   - patient, caregiver, clinician, receptionist, or administrator
   - marketing page, operational app surface, form flow, or mixed journey
   - whether the surface handles health data, urgency signals, consent, or payment
2. Inspect existing code, design system, copy tone, routes, and tests before
   choosing components or visual language.
3. Define the primary action and failure states before implementation:
   - schedule, request callback, join consultation, complete intake, view result,
     contact support, or escalate urgent symptoms
   - loading, empty, validation, unavailable slot, expired session, permission,
     and network states
4. Build a usable first screen, not a generic SaaS landing page:
   - app surfaces start with working context and task controls
   - branded service pages may use a strong human visual anchor, clear offer,
     trust signal, and direct next action
5. Verify accessibility, responsive behavior, privacy exposure, and copy safety
   before completion.

## Design Rules

- Prefer quiet confidence: readable type, strong hierarchy, restrained color,
  visible focus, large tap targets, and stable layout under dynamic text.
- Use familiar healthcare signals only when they improve orientation. Do not
  decorate with medical icons, fake vitals, or trust badges that say nothing.
- Keep urgent and routine actions distinct. Never hide emergency guidance behind
  marketing copy, a carousel, or a low-contrast footer.
- Use explicit labels for dates, time zones, provider type, location, modality,
  insurance/payment scope, consent, and next step.
- Treat forms as core product surfaces. Preserve entered data where safe, show
  errors next to fields and in summary when useful, and avoid ambiguous success.
- Do not make diagnosis claims, treatment guarantees, or emergency triage logic
  unless the product requirements and domain review define them.

## Data And Trust

- Minimize displayed and collected health data to what the task needs.
- Do not place sensitive patient details in decorative previews, analytics labels,
  URLs, client logs, screenshots, or mock examples without explicit need.
- For authentication, authorization, retention, audit, encryption, consent, or
  regulated deployment work, use the relevant security guidance and state any
  assumptions. This skill is not a legal or clinical compliance review.
- If risk is unclear, surface it before shipping the workflow.

## Required Checks

- Check keyboard navigation, focus order, labels, contrast, error messaging,
  zoom/reflow, reduced motion, and mobile tap ergonomics.
- Check mobile and desktop layouts for overlapping text, clipped controls,
  fixed headers over content, and unstable appointment or form controls.
- Check states for no availability, clinician unavailable, session timeout,
  upload failure, payment failure, and support fallback when applicable.
- Test the changed workflow with the repo's normal tests and visual/browser
  checks when available.

## References

- Read [references/healthcare-ui-checklist.md](references/healthcare-ui-checklist.md)
  when designing or reviewing a medical page, form, scheduling flow, portal
  surface, or telehealth workflow.
- Use dedicated security or threat-model skills when the user asks for a
  security review or when the implementation touches sensitive data boundaries.
