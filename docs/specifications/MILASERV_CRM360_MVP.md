# Milaserv CRM360 — Telesales Leads Distributor MVP
## Source-of-Truth Product and Engineering Specification

**Status:** Approved MVP specification  
**Project:** Milaserv CRM360  
**Module:** Telesales Leads Distributor, Sessions, Breaks, CDR Matching and Reporting  
**Phase:** Phase 1 — before full Order Management  
**Target capacity:** At least 200 concurrent/registered users and long-term high-volume lead storage  
**Display timezone:** Africa/Cairo  
**Storage timezone:** UTC  

---

# 1. Non-negotiable implementation rules

1. Inspect the existing repository before changing architecture.
2. Reuse the existing stack, conventions, authentication, UI components, Prisma schema, API patterns, logging, validation and deployment setup.
3. Do not replace or rewrite working modules unless required.
4. Do not delete existing project functionality.
5. Use migrations. Never manually alter production database tables.
6. All role and ownership checks must be enforced in the backend, not only hidden in the frontend.
7. Lead assignment and Take Lead must be atomic and concurrency-safe.
8. Do not fake device-wide inactivity detection inside a normal browser page. A website cannot reliably detect mouse or keyboard activity outside its own tab/window.
9. For device-wide idle detection, design a small Windows companion agent or a managed browser extension. The web application may have an interim tab-level activity monitor, but it must be clearly marked as limited.
10. Do not add the complete order-management module in this phase. Only store the required external order number for `Order Created`.
11. Preserve raw imported values in addition to normalized/mapped values.
12. Do not treat long identifiers as numeric values.
13. Do not expose medication data in general Agent Leads Search results.
14. Every import, assignment, reassignment, Take Lead, disposition, session, break and CDR match must be auditable.
15. Use server-side pagination and indexed queries. Never load all leads or CDR records into the browser.
16. Auto-refresh must not be implemented as a full-page reload.
17. Do not guess ambiguous source dates. Require an import date-format selection and preview.
18. Never count an employee as Vacation merely because they took zero breaks.

---

# 2. User roles and dashboards

Use the following canonical roles:

- `TEAM_LEADER`
- `SHIFT_SUPERVISOR`
- `AGENT`

`Shift Manager` may appear as a legacy label, but the canonical role in this MVP is `SHIFT_SUPERVISOR`.

## 2.1 Admin Dashboard

Accessible to:

- Team Leader
- Shift Supervisor

### Team Leader permissions

- Upload Cash lead files.
- Upload Insurance lead files.
- Upload Yeastar CDR files.
- View all teams, shifts, users, leads and reports.
- Manage users and role assignments.
- Configure permitted lead types by user/shift.
- Configure source column mapping.
- Configure CDR timezone.
- Configure extension-to-agent mapping.
- Reassign or release leads with a required reason.
- View all audit logs.
- Export reports.
- View sessions and breaks.
- View Cash and Insurance operational dashboards.

### Shift Supervisor permissions

Limited to assigned teams/shifts unless explicitly granted broader access:

- View agents in assigned team/shift.
- View live session and break status.
- View lead allocations and daily dispositions.
- View shift reports.
- Reassign/release a lead with a required reason.
- View agents over the break allowance.
- View Cash and Insurance progress for assigned scope.
- Must not change global settings unless separately authorized.

## 2.2 Agent Dashboard

Agent can:

- Start and end a work session.
- Start and end a manual break.
- View current session and break counters.
- Select Cash Leads or Insurance Leads only when allowed by schedule/permission.
- Generate one lead at a time.
- Call Customer.
- Save a disposition.
- Search leads by phone or identity.
- Take Lead when eligible.
- View personal daily statistics.
- View personal break/session history.

Agent cannot:

- Hold more than one active lead.
- Take a lead owned by another active agent.
- Generate another lead before completing required fields for the current lead.
- View medication data in the general Leads Search results.
- Upload files.
- View another agent’s reports.
- Change ownership without using the controlled Take Lead or admin reassignment process.

---

# 3. Navigation structure

## 3.1 Admin navigation

1. Overview
2. Live Shift Monitor
3. Leads Distributor
4. Cash Leads
5. Insurance Leads
6. Leads Search
7. Lead Reports
8. Converted Leads
9. Sessions & Breaks
10. Monthly Attendance
11. Yeastar CDR Imports
12. CDR Matching Reports
13. Users & Shifts
14. Import History
15. Audit Log
16. Settings

## 3.2 Agent navigation

1. Start Session / Current Session
2. My Current Lead
3. Lead Distributor
4. Cash Leads
5. Insurance Leads
6. Leads Search
7. My Daily Results
8. My Breaks
9. My Session History

---

# 4. Session management

## 4.1 Start Session

`Start Session` must be visible at the top of the Agent Dashboard.

An agent cannot:

- Generate Lead
- Take Lead
- Call Customer
- Start Break

unless an active session exists.

### Session fields

- session id
- user id
- shift id
- team id
- started at
- ended at
- status
- last activity at
- total work seconds
- total break seconds
- active work seconds
- device id, when companion app is used
- force-closed by
- force-close reason

### Session statuses

- `ACTIVE`
- `ON_MANUAL_BREAK`
- `ON_IDLE_BREAK`
- `ENDED`
- `FORCE_CLOSED`

Store timestamps in UTC and display in `Africa/Cairo`.

---

# 5. Break management

## 5.1 Manual break

When an Agent starts a manual break:

- Save the start timestamp.
- Change session status to `ON_MANUAL_BREAK`.
- Show a live break timer.
- Disable Generate Lead and Take Lead.
- Keep the currently owned lead locked to the same agent.
- Do not automatically release a current lead.

When the break ends:

- Save end timestamp.
- Calculate duration.
- Add to daily total.
- Return session status to `ACTIVE`.

## 5.2 Device-wide idle break

Business rule:

- If there is no mouse or keyboard activity on the whole managed device for five minutes, create an idle break.
- The idle break start time must equal the time of the last actual activity, not the time when the five-minute threshold is reached.

Example:

- Last activity: 10:00
- Threshold detected: 10:05
- Recorded break start: 10:00
- Activity resumes: 10:12
- Break duration: 12 minutes

### Required architecture

A normal web page cannot reliably monitor device-wide activity. Implement or design:

- a lightweight Windows companion agent, preferred; or
- a managed browser extension.

The companion must send only:

- user id
- device id
- last activity timestamp
- idle duration
- heartbeat timestamp
- companion version

It must not collect:

- key contents
- passwords
- screenshots
- screen content
- opened document content

Provide a secure authenticated heartbeat endpoint and device registration model.

## 5.3 Break reporting

For every employee/day show:

- break count
- each break start/end
- break type: `MANUAL` or `IDLE`
- each break duration
- total manual break duration
- total idle break duration
- total break duration
- longest break
- average break duration
- current open break, if any

Color rule:

- total break <= 60 minutes: green
- total break > 60 minutes: red

Filters:

- over one hour
- within one hour
- no breaks
- currently on break
- manual only
- idle only

## 5.4 Daily reset and attendance classification

Daily counters reset at the beginning of the new calendar day in `Africa/Cairo`. Historical events are never deleted.

Attendance statuses:

- `PRESENT`
- `WORKED_NO_BREAK`
- `VACATION`
- `ABSENT`
- `DAY_OFF`
- `PARTIAL_SESSION`
- `SESSION_NOT_CLOSED`
- `FORCE_CLOSED`

A working employee with zero breaks must be `WORKED_NO_BREAK`, not Vacation.

Vacation must come from schedule/approved attendance data or an authorized manual classification.

---

# 6. Lead types

Two independent lead pools:

- `CASH`
- `INSURANCE`

Each type has:

- separate import batches
- separate counters
- separate permissions
- separate progress reporting
- separate completion and remaining counts
- separate converted order counts

Do not mix Cash and Insurance counters except in an overall summary.

---

# 7. Import pipeline

Supported input:

- XLSX
- XLS
- CSV, when supported by the existing project

## 7.1 Import steps

1. Upload file
2. Detect sheet(s)
3. Select source type
4. Select date format / locale
5. Map columns
6. Validate required columns
7. Normalize data
8. Preview import
9. Detect duplicate source rows
10. Detect already-imported source records
11. Confirm import
12. Process in a background job
13. Persist import summary and errors
14. Make valid lead batch available for distribution

## 7.2 Import preview

Show:

- total rows
- valid rows
- invalid rows
- duplicate rows in the same file
- records already imported
- invalid phones
- invalid dates
- missing required values
- sample normalized records
- grouped lead count
- medication item count
- unknown source columns

Allow downloading an import-error file.

## 7.3 Batch ordering

Default lead allocation order:

1. batch priority
2. original source row/group order
3. import timestamp
4. lead id as deterministic tie-breaker

Do not randomize unless a future setting explicitly enables it.

---

# 8. Insurance Leads mapping

Source sample: `docs/samples/med_gulf_sample.xlsx`

The source contains medication/item-level rows. Do not create one lead per spreadsheet row.

## 8.1 Insurance lead grouping

Preferred lead grouping key:

`NATIONALID + claim_seq_id`

Fallback:

`normalized phone + INVOICENO + SERVICEDATE`

Create:

- one lead header
- one or more child medication items

## 8.2 Insurance item uniqueness

Preferred unique source item key:

`inv_item_idm`

Fallback:

`claim_seq_id + code`

## 8.3 Insurance source mapping

| Source column | System field | Type | Required | Agent assigned-lead page | General Leads Search |
|---|---|---:|---:|---|---|
| Phone Number | phone_raw + phone_normalized | text | yes | show | show masked |
| Class | member_class | text | no | show | show |
| APPREFNO | app_reference_no | text | no | reference details | hide |
| claim_seq_id | claim_sequence_id | text | yes | reference details | hide |
| CLAIMDATE | claim_date | date | yes | show | show |
| SERVICEDATE | service_date | date | yes | show | show |
| code | item_code | text | yes | medication table | hide |
| FULLNAME | customer_full_name | text | yes | show | show |
| GENDER | gender | enum/text | no | show | show |
| inv_item_idm | invoice_item_key | text | yes | hide | hide |
| INVOICENO | invoice_no | text | yes | reference details | hide |
| NATIONALID | national_id | text | yes | masked | masked |
| PayerId | payer_id | text | no | reference details | hide |
| PAYERTAXSHARE | payer_tax_share | decimal | no | reference details | hide |
| POLICYNO | policy_no | text | no | reference details | hide |
| preAuthRefNo | preauth_reference_no | text | no | reference details | hide |
| Medicine | medication_name | text | yes | medication table | hide |
| QTY | quantity | decimal | yes | medication table | hide |
| SERVICECODE | service_code | text | no | medication table | hide |
| storeid | branch_code | text | yes | show | show |
| TOT SERVICE PAT SHARE | patient_share_total | decimal | no | reference details | hide |
| transno | transaction_no | text | no | reference details | hide |
| UNITSERVICEPRICE | unit_service_price | decimal | no | medication table | hide |
| upc_code | upc_code | text | no | medication table | hide |

## 8.4 Long identifiers

Store all of the following as strings/text, never JavaScript numbers, database floating point values, or Excel numeric values:

- claim sequence
- invoice number
- transaction number
- policy number
- payer id
- app reference
- preauthorization reference
- national id
- source item id
- UPC/item codes when leading zeros may occur

---

# 9. Cash Leads mapping

Source sample: `docs/samples/cash_leads.xlsx`

Repeated phone rows may represent different medications for the same lead.

## 9.1 Cash grouping

Default grouping key:

`normalized phone + source lead date + branch code`

Create:

- one lead header
- multiple medication item rows

Allow the Admin import preview to split a group manually if data indicates separate customers or separate events.

## 9.2 Cash mapping

| Source column | System field | Type | Required | Rule |
|---|---|---:|---:|---|
| Agent | legacy_agent_label | text | no | Audit/reference only by default |
| Mobile Number | phone_raw + phone_normalized | text | yes | Saudi phone normalization |
| Date | source_lead_date | date | yes | Explicit source date format required |
| Branch | branch_code | text | yes | Keep as text |
| City | city | text | no | Normalize known spelling variants |
| Medication | medication_name | text | yes | Child lead item |
| Quantity | quantity | decimal | yes | Allow zero but flag for review |
| Price | price_raw + price_amount | text + decimal | no | Parse `1.26K` as 1260 and retain raw |
| Status | source_status + mapped_disposition | text + enum | no | Map legacy status |
| Date to be called | next_follow_up_at | date/datetime | conditional | Required for reschedule |
| Days to dispense | derived only | derived | no | Do not trust imported value |
| Notes | notes | text | no | Preserve Arabic/English |

## 9.3 Legacy Agent field

Do not automatically assign imported `Agent` as the live owner.

Provide Admin import option:

- `Do not preserve source assignment` — default
- `Preserve source assignment when a valid user mapping exists`

Always preserve source value for audit.

## 9.4 Cash legacy status mapping

- `Answered - No Order` -> `ANSWERED_NO_ORDER`
- `No Answer or Busy` -> `NO_ANSWER_BUSY`
- `Reschedule call` -> `RESCHEDULE_FOLLOW_UP`
- blank -> `AVAILABLE`

Preserve original raw status.

## 9.5 Date ambiguity

The source sample may contain date values whose interpretation depends on Excel locale.

Before import confirmation, require:

- DD/MM/YYYY
- MM/DD/YYYY
- explicit custom format

Show a preview of parsed dates. Do not silently guess.

## 9.6 Days to dispense

Ignore imported values such as `46225 Days Overdue`.

Calculate all future/overdue values from actual date fields:

- last dispense date
- selected refill period
- next refill date
- current date

---

# 10. Phone normalization

Canonical Saudi mobile format:

`9665XXXXXXXX`

Input formats that must match:

- `05XXXXXXXX`
- `5XXXXXXXX`
- `9665XXXXXXXX`
- `+9665XXXXXXXX`
- sample nine-digit form such as `500020981`

Normalization:

1. Trim whitespace.
2. Remove `+`, spaces, dashes and parentheses.
3. Keep digits only.
4. `05XXXXXXXX` -> remove initial zero and prefix `966`.
5. `5XXXXXXXX` -> prefix `966`.
6. `9665XXXXXXXX` -> keep.
7. Validate expected Saudi mobile length and prefix.
8. Store original raw value.
9. Store normalized value.
10. Create an index on normalized phone.

Do not destructively overwrite the source value.

---

# 11. Lead distribution

## 11.1 Generate Lead

When Agent clicks Generate Lead:

1. Verify active session.
2. Verify not on manual or idle break.
3. Verify Agent has permission for selected lead type and partner.
4. Verify Agent does not own another active lead.
5. Select the next eligible lead using deterministic ordering.
6. Atomically claim and lock the lead.
7. Create an assignment-history record.
8. Set status to `PENDING_CALL`.
9. Return lead data.
10. Do not make it available to any other Agent.

Use a database transaction and a concurrency-safe pattern such as row locking, `SELECT ... FOR UPDATE SKIP LOCKED`, a conditional update with returned row, or the best equivalent supported by the existing stack/database.

Do not rely on frontend checks or a 15-second refresh to prevent duplicate allocation.

## 11.2 One active lead

The Agent cannot Generate Lead or Take Lead while owning a lead in:

- `PENDING_CALL`
- `CUSTOMER_CONTACTED`
- `DISPOSITION_REQUIRED`
- `ORDER_NUMBER_REQUIRED`
- incomplete follow-up form

Return a clear backend validation error.

## 11.3 Assignment history

Record:

- lead id
- agent id
- assignment source
- assigned timestamp
- released timestamp
- release actor
- release reason
- previous assignment id
- team/shift
- active flag

Assignment sources:

- `GENERATE_LEAD`
- `TAKE_LEAD`
- `ADMIN_ASSIGNMENT`
- `ADMIN_REASSIGNMENT`

Never overwrite history.

---

# 12. Call Customer and lead lifecycle

## 12.1 Main statuses

- `IMPORTED`
- `AVAILABLE`
- `PENDING_CALL`
- `CUSTOMER_CONTACTED`
- `DISPOSITION_REQUIRED`
- `CALLBACK_ELIGIBLE`
- `FOLLOW_UP_SCHEDULED`
- `CONVERTED_TO_ORDER`
- `COMPLETED`
- `INVALID_NUMBER`
- `ARCHIVED`

## 12.2 Call Customer action

When Agent clicks `Call Customer`:

- Verify Agent owns the lead.
- Verify session is active.
- Create a call-attempt placeholder.
- Record click timestamp.
- Change lead from `PENDING_CALL` to `CUSTOMER_CONTACTED`.
- Open disposition form.
- Do not treat the click itself as proof that a real call happened.
- CDR import later verifies the call.

Keep operational disposition separate from provider CDR call status.

---

# 13. Dispositions

Use these exact user-facing dispositions:

1. Already Dispensed / Approved&Dispensed
2. Acute Medication Cases
3. Wrong Numbers
4. No Answer / Busy
5. Order Created
6. Answered No Order
7. Not Active Members
8. Reschedule / Follow-up Requests
9. Uncovered Customers
10. Laboratory Cases

Suggested enum values:

- `ALREADY_DISPENSED`
- `ACUTE_MEDICATION_CASE`
- `WRONG_NUMBER`
- `NO_ANSWER_BUSY`
- `ORDER_CREATED`
- `ANSWERED_NO_ORDER`
- `NOT_ACTIVE_MEMBER`
- `RESCHEDULE_FOLLOW_UP`
- `UNCOVERED_CUSTOMER`
- `LABORATORY_CASE`

Every disposition record must store:

- lead id
- assignment id
- agent id
- disposition
- notes
- created at
- source
- required conditional fields
- previous value when edited
- audit actor and timestamp

---

# 14. Conditional disposition behavior

## 14.1 Order Created

Show required field:

`External Order Number`

Rules:

- required
- manually entered
- copied from the external order-management system
- Milaserv must not auto-generate it
- duplicate-protected
- treat as text unless the external system guarantees numeric-only forever
- trim whitespace
- case-normalize if alphanumeric
- unique database constraint
- Agent cannot Generate Lead until successfully saved

Result:

- status becomes `CONVERTED_TO_ORDER`
- active ownership is closed historically
- lead appears in Converted Leads report

Do not add order value in this MVP.

## 14.2 Already Dispensed / Approved&Dispensed

Required fields:

- last dispense date
- refill period from 26 through 80 days

Formula:

`next_refill_date = last_dispense_date + refill_period_days`

Show calculated date before saving.

Include in:

- daily lead report
- refill report
- lead profile
- export
- future refill list

## 14.3 Reschedule / Follow-up Requests

Required:

- follow-up date
- preferred period: Morning or Evening
- optional exact time
- notes

Result:

- status `FOLLOW_UP_SCHEDULED`
- remains assigned to the same Agent
- not available for Take Lead by default
- Team Leader or Shift Supervisor may reassign with required reason

## 14.4 No Answer / Busy — revised ownership rule

This rule is mandatory.

After the current Agent saves `No Answer / Busy`:

1. Save the completed attempt and disposition.
2. Close the active assignment.
3. Preserve the original Agent in assignment/call history.
4. Change lead status to `CALLBACK_ELIGIBLE`.
5. Remove active owner.
6. Make the lead searchable.
7. Allow another authorized Agent to use Take Lead immediately.
8. Do not create a duplicate lead.
9. A new Take Lead action creates a new active assignment and atomic lock.
10. The previous Agent’s attempt remains visible in history.
11. Do not release ownership before the original Agent saves the disposition.
12. Do not release a `FOLLOW_UP_SCHEDULED` lead under this rule.

Reason: the customer may not answer initially but may call back and reach another Agent.

## 14.5 Wrong Numbers

- status becomes `INVALID_NUMBER`
- preserve original number
- require or allow validation notes
- Admin/Supervisor can correct and reopen with audit history

## 14.6 Other final dispositions

For MVP, the following normally close the current lead as completed:

- Acute Medication Cases
- Answered No Order
- Not Active Members
- Uncovered Customers
- Laboratory Cases

Supervisor may reopen with reason.

---

# 15. Leads Search

Search fields:

- normalized phone
- raw phone
- national/identity number

Use indexed exact search first. Optional partial search must be permission-controlled and rate-limited.

## 15.1 Agent search result fields

Show:

- customer name
- masked phone
- masked identity
- lead type
- partner
- branch
- city
- current status
- active owner state
- last contact date
- callback eligibility
- household/family group

Do not show:

- medication names
- quantities
- pricing
- medical details
- insurance financial references

## 15.2 Household/family results

Group related people when:

- same normalized phone
- explicit household reference, if supplied
- other approved source relationship

Do not merge different national identities into a single person record.

## 15.3 Take Lead

Before Take Lead:

- Agent has active session
- Agent is not on break
- Agent has no active lead
- Agent is authorized for the lead type/partner
- lead has no active owner
- lead is in an eligible status, including `AVAILABLE` or `CALLBACK_ELIGIBLE`

Take Lead must:

- use an atomic transaction
- create a new assignment record
- set active owner
- change status to `PENDING_CALL`
- prevent simultaneous takeover by another Agent
- keep all previous history

If already taken, return:

`This lead is currently assigned to another agent.`

---

# 16. Yeastar CDR import

Source sample:

`docs/samples/yeastar_cdr_sample.xls`

The source columns are:

- unnamed first column containing a unique-looking record id
- Time
- Call From
- Call To
- Call Duration
- Ring Duration
- Talk Duration
- Status
- Reason
- Communication Type
- Outbound Caller ID

## 16.1 CDR mapping

| Source | System field | Rule |
|---|---|---|
| unnamed first column | cdr_record_id | unique import/idempotency key |
| Time | call_started_at | parse in configured CDR timezone |
| Call From | call_from_raw | parse/normalize based on direction |
| Call To | call_to_raw | parse/normalize based on direction |
| Call Duration | call_duration_seconds | convert to integer seconds |
| Ring Duration | ring_duration_seconds | convert to integer seconds |
| Talk Duration | talk_duration_seconds | convert to integer seconds |
| Status | provider_status_raw + mapped status | preserve raw |
| Reason | provider_reason_raw | preserve raw and parse when useful |
| Communication Type | direction | inbound/outbound |
| Outbound Caller ID | outbound_caller_id | trunk/audit field, not customer key |

## 16.2 CDR direction-aware matching

### Outbound

- customer phone = normalized `Call To`
- Agent/extension = human endpoint parsed from `Call From`

Example format:

`Abdelmagied Ali<7033>`

Extract:

- name = Abdelmagied Ali
- extension = 7033

### Inbound

- customer phone = normalized `Call From`
- Agent/extension = final connected human endpoint from `Call To`, `Reason`, transfer information or the final connected leg

Do not treat these as Agents:

- IVR Duty Hours
- IVR Main Message
- Queue Tele
- Queue CC
- other IVR/Queue/system endpoints

## 16.3 Provider status mapping

Preserve raw status and map at least:

- `ANSWERED` -> `ANSWERED`
- `NO ANSWER` -> `NO_ANSWER`
- `BUSY` -> `BUSY`
- unknown/failed values -> `FAILED_OR_UNKNOWN`

Use talk duration and call legs as supporting evidence. Do not overwrite raw provider status.

## 16.4 CDR timezone

Do not infer timezone from date text.

Create an Admin setting:

- source CDR timezone
- default display timezone Africa/Cairo

Import:

1. parse in configured source timezone
2. convert to UTC
3. store UTC
4. display/report in Africa/Cairo

## 16.5 Relevant CDR filtering

The CDR contains thousands of calls unrelated to uploaded leads.

Efficient approach:

1. normalize source CDR customer endpoints
2. stage CDR rows
3. create/use indexed normalized customer number
4. join only against normalized lead phones
5. persist only relevant matches in lead call-attempt/report tables
6. retain import summary for unrelated rows without expanding lead reports

Do not loop over all leads in application memory.

## 16.6 Matching confidence

Prefer:

- normalized phone
- assignment timestamp
- Agent extension
- session/shift time window
- call direction
- call timestamp

Match statuses:

- `MATCHED`
- `NOT_MATCHED`
- `AMBIGUOUS`
- `AGENT_MISMATCH`
- `OUTSIDE_ASSIGNMENT_WINDOW`
- `INVALID_PHONE`
- `UNMAPPED_EXTENSION`

Never silently guess ambiguous matches.

## 16.7 Idempotency

Use `cdr_record_id` as a unique key.

When missing, create a deterministic hash from stable raw fields.

Uploading the same file twice must not duplicate CDR records.

---

# 17. CDR end-of-day report

For every relevant lead include:

- lead id
- customer name
- masked identity
- normalized phone
- lead type
- import batch
- assigned Agent
- assigned extension
- assignment time
- Agent disposition
- was called: yes/no
- CDR match status
- Call From
- Call To
- first call time
- last call time
- number of attempts
- provider last status
- provider reason
- total call duration
- total ring duration
- total talk duration
- external order number, if any
- mismatch reason

Mismatch examples:

- Agent selected Customer Contacted but no matching CDR call
- call made from a different Agent
- unmapped extension
- call occurred before assignment
- invalid phone
- multiple candidate calls
- callback reached a different Agent

---

# 18. Admin dashboards and reports

Global filters:

- Today
- Yesterday
- exact date
- date range
- team
- shift
- Agent
- lead type
- partner
- batch
- disposition
- call verification status

## 18.1 Overview cards

- active Agents
- Agents on manual break
- Agents on idle break
- total uploaded leads
- completed leads
- remaining leads
- completion percentage
- contacted leads
- verified calls
- leads with no verified calls
- orders created
- Agents over break allowance

## 18.2 Separate Cash and Insurance sections

For each type show:

- total
- available
- assigned
- pending call
- customer contacted
- callback eligible
- follow-up scheduled
- completed
- remaining
- completion percentage
- orders created
- converted lead count
- disposition counters

Exact disposition counters:

- Already Dispensed / Approved&Dispensed
- Acute Medication Cases
- Wrong Numbers
- No Answer / Busy
- Order Created
- Answered No Order
- Not Active Members
- Reschedule / Follow-up Requests
- Uncovered Customers
- Laboratory Cases

## 18.3 Agent performance

Per Agent:

- session start/end
- total working time
- total break time
- manual break time
- idle break time
- break count
- leads generated
- leads taken from search
- leads contacted
- leads completed
- calls initiated
- CDR verified calls
- orders created
- disposition counts
- Cash count
- Insurance count
- current active lead
- last activity timestamp

## 18.4 Converted Leads report

Include:

- lead id
- type
- customer
- masked phone/identity according to permission
- Agent
- shift
- contact time
- external order number
- conversion timestamp
- CDR verification
- provider last status
- batch
- partner

Do not add order value in Phase 1.

---

# 19. Auto refresh and real-time behavior

Target refresh interval: 15 seconds.

Do not use full-page reload.

Preferred:

- WebSocket or Server-Sent Events for live status
- 15-second polling fallback
- React Query or existing project equivalent
- invalidate only affected queries
- update counters and rows incrementally

Real-time pages:

- Live Shift Monitor
- current breaks
- lead assignments
- Agent availability
- Cash/Insurance counters
- remaining lead counts

Lead locks must be server/database controlled and must not depend on auto-refresh.

---

# 20. Scale, performance and retention

Design for:

- at least 200 users
- concurrent Generate Lead / Take Lead actions
- millions of leads long-term
- large daily CDR imports
- daily/monthly reports
- large Excel imports

Required patterns:

- server-side pagination
- indexed normalized phone
- indexed national id
- indexed active-owner/status/type/batch fields
- background import jobs
- batch inserts
- retry-safe jobs
- progress tracking
- aggregation/materialized summary tables where helpful
- caching for dashboard counters
- archive strategy
- soft delete where appropriate
- audit logs
- database backups
- avoid N+1 queries
- avoid browser-side large-file processing

---

# 21. Suggested data model

Adapt naming to existing repository conventions.

## User / Role / Scope

- User
- Role or RBAC relation
- Team
- Shift
- ShiftSchedule
- UserLeadPermission
- AgentExtensionMapping
- DeviceRegistration

## Session / Break

- WorkSession
- BreakEvent
- ActivityHeartbeat
- AttendanceDay

## Import

- LeadImportBatch
- LeadImportFile
- LeadImportRow
- LeadImportError
- ImportColumnMapping

## Leads

- Lead
- LeadPerson or CustomerProfile
- LeadMedicationItem
- LeadAssignment
- LeadDisposition
- LeadFollowUp
- LeadOrderReference
- LeadStatusHistory
- LeadNote
- HouseholdGroup, optional

## Calls

- CdrImport
- CdrRawRecord or CdrStagingRecord
- CallAttempt
- CallMatch
- ExtensionMapping

## Audit

- AuditLog

## Critical database constraints

- unique external order number
- unique insurance source item key where present
- unique CDR record id
- at most one active assignment per lead
- at most one active lead per Agent
- valid refill period check: 26 to 80
- normalized phone index
- national identity index
- batch/type/status indexes
- assignment and call timestamp indexes

Where partial unique indexes are supported, use them for active assignment constraints. Otherwise use a transaction plus guard table/constraint strategy.

---

# 22. UI theme from Milaserv logo

Source:

`docs/branding/milaserv_logo.jpg`

Brand tokens:

- Brand Navy: `#2A3144`
- Primary Teal: `#21A7A5`
- Deep Teal: `#2A8B89`
- White: `#FEFEFE`
- Soft Gray: `#BBC1CB`
- Muted Slate: `#6E7580`
- Light Background: `#F4F7F8`
- Border: `#D9DEE5`
- Main Text: `#1F2937`

UI rules:

- Navy sidebar
- logo at top-left
- white sidebar text/icons
- teal active item, pill or left border
- white cards
- light gray app background
- navy table headers
- teal primary buttons
- subtle shadows
- 12–16 px card radius
- responsive layouts
- no large empty margins
- no generic “AI-generated dashboard” appearance
- Cash and Insurance clearly separated
- Busy / No Answer uses amber and `Callback Eligible` badge
- Completed / Order Created uses semantic green
- break over one hour and errors use semantic red
- semantic colors do not replace the main brand teal

Ensure accessible contrast and keyboard navigation.

---

# 23. Security and privacy

- Backend authorization for every endpoint/action.
- Mask identity and phone according to role.
- Hide medication data from general Agent Leads Search.
- Validate and scan uploads.
- Restrict file type and size.
- Secure object storage.
- Rate-limit search and import endpoints.
- Record actor, timestamp and before/after values for sensitive changes.
- Prevent horizontal privilege escalation.
- Prevent IDOR.
- Do not expose raw database IDs when existing project conventions use safe public IDs.
- Use HTTPS.
- Secure companion heartbeat authentication.
- Do not log medical data unnecessarily.
- Do not expose raw CDR data beyond authorized users.

---

# 24. Required tests

## Distribution concurrency

- Simulate at least 50 concurrent Generate Lead requests.
- Every successful Agent receives a distinct lead.
- No duplicate active ownership.
- One active lead per Agent.

## Take Lead concurrency

- Two Agents try to Take Lead simultaneously.
- Only one succeeds.
- Other receives conflict response.
- History remains correct.

## Busy / No Answer release

- Agent A owns lead.
- Saves No Answer / Busy.
- Active ownership closes.
- Lead becomes Callback Eligible.
- Agent B searches and takes it.
- Agent A remains in history.
- Agent C cannot take after Agent B owns it.

## Follow-up ownership

- Agent selects Reschedule.
- Lead remains assigned.
- It does not become Take Lead eligible.
- Supervisor can reassign with reason.

## Order Created

- Cannot save without external order number.
- Duplicate external order rejected.
- Cannot Generate Lead until save completes.
- No order value fields required.

## Refill

- Accept only 26–80.
- Calculate correct date.
- Persist and export.

## Phone normalization

Test equivalent inputs:

- 05…
- 5…
- 9665…
- +9665…
- source sample 9-digit values

## Insurance grouping

- Multiple medication rows for same claim become one lead.
- Items remain separate.
- Long ids preserve exact digits.

## Cash grouping

- Repeated phone/date/branch rows become one lead with multiple items.
- Ambiguous date format requires explicit selection.
- `1.26K` parses to 1260 and raw value is retained.

## CDR

- Large file with unrelated numbers.
- Only relevant lead numbers matched.
- inbound/outbound direction handled correctly.
- IVR/Queue not treated as Agents.
- duplicate import does not duplicate calls.
- ambiguous matches remain ambiguous.
- CDR timezone setting is honored.

## Idle break

- Last activity 10:00.
- threshold reached 10:05.
- break starts 10:00.
- resumes 10:12.
- duration 12 minutes.

## Authorization

- Agent cannot access admin reports.
- Shift Supervisor limited to scope.
- hidden frontend action still blocked by backend.
- medication hidden from search response, not merely hidden in UI.

---

# 25. Phase 1 deliverables

Phase 1 includes:

- RBAC
- Team Leader, Shift Supervisor, Agent dashboards
- session management
- manual breaks
- idle-break design and companion API
- Cash import
- Insurance import
- grouping and mapping
- Generate Lead
- atomic assignment
- Call Customer
- dispositions
- external order number
- refill calculation
- Leads Search
- Take Lead
- Busy/No Answer callback eligibility
- phone normalization
- Admin counters
- Agent reports
- daily/period reports
- CDR upload
- CDR direction-aware matching
- end-of-day CDR report
- exports
- auto-refresh
- audit logs
- tests
- documentation

---

# 26. Explicitly deferred to Phase 2

Do not implement unless separately requested:

- full Order Management
- order value
- order item management
- completed/cancelled order lifecycle
- sales revenue
- average order value
- financial conversion rate
- commissions
- Agent sales targets
- partner revenue
- forecasting
- external order-system integration beyond storing the external order number

---

# 27. Definition of done

A phase is not complete until:

1. database migration exists
2. backend validation exists
3. backend authorization exists
4. UI exists
5. loading/empty/error states exist
6. audit event exists where relevant
7. automated tests exist
8. manual QA steps are documented
9. no TypeScript/lint/build errors
10. migration and rollback notes exist
11. sample imports are tested
12. responsive behavior is checked
13. no existing module is broken
14. README or module documentation is updated
