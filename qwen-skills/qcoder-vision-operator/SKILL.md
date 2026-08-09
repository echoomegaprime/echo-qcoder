---
name: qcoder-vision-operator
description: Give QCoder governed visual perception for screenshots, web pages, documents, UI verification, camera-derived artifacts, and multimodal coding. Use when visual evidence is necessary. Do not use for unrestricted surveillance, biometric identification, hidden credential capture, or when text/source inspection is sufficient.
---

# QCoder Vision Operator

## Expected input

Require a specific visual question and an authorized artifact, page, tab, device, or camera source. Prefer the smallest source that can answer it.

## Required sequence

1. For a local image, preserve the original and use an available image/OCR capability that returns bounded structured evidence.
2. For web UI, reserve a dedicated ShadowGlass tab, navigate through scoped `claude.shadowglass.*` capabilities, and collect the accessibility tree, visible text, console/network evidence, and screenshots needed for the claim.
3. Never read protected fields or capture secrets. Use the opaque Vault-to-browser transfer workflow when credentials must enter an allowlisted field.
4. For a camera or home-device source, use only the current role-scoped ECHO vision or smart-home capability and the requested device. Do not enumerate unrelated people or locations.
5. Treat the 27B coding model as text-first. When pixels require semantic vision, route the artifact to a Qwen3-VL or existing ECHO vision sidecar and return structured observations to QCoder.
6. Keep the vision sidecar off the two QCoder GPUs while the 27B lease is active unless capacity has been measured and the lease controller explicitly permits co-residency.

## Verification

For UI claims, combine at least two applicable evidence types: screenshot, accessibility tree, DOM-visible text, console, network trace, or deterministic UI test. A screenshot alone is not proof of backend behavior.

## Stop conditions

Stop if the source is not authorized, the tab cannot be isolated, protected-field readback is active, a visual result would expose restricted personal data, or no compatible vision backend is available. Report the missing capability without inventing an observation.

## Output format

Return the source identity, observation time, bounded observations, confidence, corroborating evidence, and any inaccessible region or unresolved ambiguity.
