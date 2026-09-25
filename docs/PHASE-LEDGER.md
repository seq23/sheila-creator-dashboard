# Phase ledger

Status of each phase in `BUILD_PLAN.md` section 15. **Live** = built and covered by automated
tests. **Scaffolded** = the contract (routes, job handler, workflow, screen) exists with a
stand-in so the app runs end to end; the real behaviour is the phase's remaining work.
**Not yet proven** = only a person with the test accounts can confirm it.

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Proof tests | Not yet proven | Needs a person: Buffer API test post to test TikTok / IG / YouTube; OpenShorts on a real sample in Actions. Fakes cover the shapes. |
| 1. Foundation + Dump | Live | Repo, one-Worker deploy, email-code login, D1 schema (full data model), chunked resumable R2 uploads, two-door Dump with notes + Dump button, Home, phone layout, Connect (Buffer key check + channels), Settings + Health. |
| 2. Client Brain | Scaffolded | Screen, routes, extract job + workflow are stubs. |
| 3. Research Brief | Scaffolded | Screen, routes, research job + workflow are stubs; Meta/Google OAuth buttons disabled. |
| 4. Editing engine | Scaffolded | `jobs/cut.py` + `job-cut.yml` exist; the Worker's cut handler is a stub. |
| 5. Review | Scaffolded | Screen + routes stubs; approval rules unit-tested in `worker/domain/approval.ts`. |
| 6. Calendar + Buffer | Scaffolded | Slotting (10/7/5, hard cap, mix rules) unit-tested in `worker/domain/slotting.ts`; Buffer client real + fake; hourly sync lane is a stub. |
| 7. Emails + Health | Live (partial) | Login code, time-to-dump, weekly recap emails; health rows; Resend real + fake. Clips-ready, posting-problem, connection-needs-you fire from the phases that own those events. |
| 8. Learning loop | Scaffolded | Metrics job + workflow stubs; Stats screen stub. |
| 9. Recycle + polish | Scaffolded | Cooldown + ranking unit-tested in `worker/domain/cooldown.ts`; recycle fields on Dump live. |
| 10. Brand deals | Scaffolded | Deal stages unit-tested; Deals screen, media kit public page (bio only), brand finder job stubs. |
| 11. Voice | Scaffolded | Hidden behind the feature switch; screen, routes, job stubs. |
| 12. Hardening + handoff | Open | Help center guides seeded (42 slugs, placeholder steps); screenshot job wired. |

## Not yet proven (needs a person)

- A real Buffer key: the GraphQL queries in `worker/services/buffer.ts` are pinned against the
  documented schema, not a live account.
- Resend from her own domain (defaults to the onboarding sender).
- OpenShorts speed on the Actions CPU runner.
