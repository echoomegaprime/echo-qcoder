# Submission posture

The source repository is public as of the 0.3.0 release, but the running plugin's target audience remains private ECHO use, not the public ChatGPT plugin directory. Public ChatGPT submission is therefore **NOT APPLICABLE** for version 0.3.0. Source visibility does not make the MCP resource, OAuth client, workspace allowlist, model endpoint, or session data public.

Private developer-mode readiness still requires a live stable MCP resource, valid OAuth discovery/protected-resource metadata, minimum scopes, successful Scan Tools, and an actual ChatGPT-generated `plugin_asdk_app...` ID. None is invented. `.app.json` remains absent until `scripts/configure-app-id.ps1` receives the real ID.

If the audience later changes to public, ECHO must separately supply and verify organization/owner permissions, stable production domain, support contact, privacy policy, terms, screenshots, country availability, review-safe authentication, five positive and three negative portal test cases, data-use/retention/deletion disclosures, and continuous endpoint availability during review. `chatgpt-app-submission.json` is not generated for this private build.
