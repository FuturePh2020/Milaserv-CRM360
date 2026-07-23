# User Acceptance Testing

> Status: template/checklist for when Phases 1–11 are functionally complete
> on staging. Not yet run — see `docs/implementation/IMPLEMENTATION_STATUS.md`
> for what actually exists today.

## Entry criteria

- All items in `docs/testing/TEST_PLAN.md` marked ✅.
- Deployed to staging per `docs/deployment/STAGING.md`.
- At least one Team Leader, one Shift Supervisor, and two Agent accounts
  seeded/created for UAT.

## UAT scenarios (walk each role through the real UI, not the API directly)

### Team Leader

- [ ] Log in, see Overview dashboard with live counters.
- [ ] Upload a Cash lead file, walk the full import preview flow, confirm.
- [ ] Upload an Insurance lead file, confirm grouping matches expectations
      against `docs/samples/med_gulf_sample.xlsx`.
- [ ] Upload a Yeastar CDR file, confirm the end-of-day match report.
- [ ] Create a user, assign a role, grant Cash/Insurance lead permission.
- [ ] Reassign a lead with a reason; confirm it appears in the audit log.
- [ ] Export a report.

### Shift Supervisor

- [ ] Log in, confirm dashboard is scoped to assigned team only.
- [ ] Attempt to view another team's data via direct URL — confirm blocked.
- [ ] View live breaks, confirm over-1-hour agents are flagged red.

### Agent

- [ ] Cannot Generate Lead / Take Lead / Call Customer before Start Session.
- [ ] Start Session, Generate Lead, confirm only one active lead at a time.
- [ ] Call Customer, save each of the 10 dispositions at least once across
      the UAT pass, confirming each conditional field behaves as specified.
- [ ] Trigger No Answer/Busy, confirm lead becomes searchable to another
      Agent and reappears in personal history.
- [ ] Search by phone, confirm medication/pricing never appears.
- [ ] Take a Callback Eligible lead found via search.
- [ ] Start/end a manual break, confirm counter and daily total update.

## Exit criteria

- All checkboxes above checked by an actual human tester on staging, not
  inferred from code review.
- Any defect found is logged and either fixed-and-retested or explicitly
  accepted as a known issue before production rollout.
