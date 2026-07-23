# MASTER PROMPT — Build Milaserv CRM360 From Scratch

You are Claude Code working inside a brand-new empty repository.

Your task is to build a complete standalone production-oriented application named:

# Milaserv CRM360

This is a completely separate project. It must not depend on, modify, merge with, import from, or reference any previous Milaserv 360 repository.

Repository name:

`milaserv-crm360`

Application name:

`Milaserv CRM360`

Database name:

`milaserv_crm360`

Default display timezone:

`Africa/Cairo`

Store timestamps internally in UTC.

Target:

- at least 200 users
- long-term large lead volume
- large Cash and Insurance imports
- large Yeastar CDR files containing thousands of unrelated numbers
- reliable concurrent Generate Lead and Take Lead behavior

Read these files before implementation:

1. `docs/specifications/MILASERV_CRM360_MVP.md`
2. `docs/mapping/Milaserv_CRM360_Data_Mapping_MVP.xlsx`
3. `docs/samples/med_gulf_sample.xlsx`
4. `docs/samples/cash_leads.xlsx`
5. `docs/samples/yeastar_cdr_sample.xls`
6. `docs/branding/milaserv-logo.jpg`

Treat the specification as product source of truth.

Do not ask broad product questions that are already answered there.

Only ask a question if:
- it is technically blocking,
- the repository or samples cannot resolve it,
- and no safe default is possible.

---

# REQUIRED TECHNOLOGY

Create a pnpm monorepo.

Use:

Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Query
- chart library compatible with Next.js
- responsive desktop/tablet UI

Backend:
- NestJS
- TypeScript
- REST API
- Swagger
- WebSocket or Server-Sent Events for live updates
- backend validation
- backend RBAC and scope authorization

Database:
- PostgreSQL
- Prisma ORM
- reviewed migrations
- partial unique indexes where required

Background processing:
- Redis
- BullMQ

Infrastructure:
- Docker
- Docker Compose
- environment-based configuration
- local, staging and production documentation

Windows activity companion:
- .NET Windows application
- detect device-wide last mouse/keyboard activity using Windows API
- send secure heartbeats
- do not record key contents, screenshots, screen content or opened files

Testing:
- unit tests
- integration tests
- concurrency tests
- import tests
- permission tests
- CDR matching tests
- basic end-to-end tests

---

# REQUIRED REPOSITORY STRUCTURE

Create:

milaserv-crm360/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── activity-agent/
├── packages/
│   ├── database/
│   ├── contracts/
│   ├── validation/
│   ├── ui/
│   └── config/
├── docs/
│   ├── specifications/
│   ├── samples/
│   ├── mapping/
│   ├── branding/
│   ├── architecture/
│   ├── implementation/
│   ├── deployment/
│   ├── testing/
│   └── release/
├── docker-compose.yml
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── CLAUDE.md

---

# USER ROLES

Implement canonical roles:

- TEAM_LEADER
- SHIFT_SUPERVISOR
- AGENT

Team Leader:
- full system access
- users, teams, shifts
- Cash imports
- Insurance imports
- CDR imports
- global reports
- lead reassignment/release
- extension mapping
- settings
- audit logs

Shift Supervisor:
- access limited to assigned team/shift
- live agents
- breaks
- assigned-scope reports
- lead reassignment/release with required reason
- cannot alter global settings unless separately permitted

Agent:
- start/end session
- start/end break
- generate lead
- call customer
- save disposition
- search by phone or identity
- take eligible lead
- view personal metrics only

All authorization must be enforced in the backend.

---

# AUTHENTICATION

Implement:

- secure login
- password hashing
- access token
- refresh token
- logout
- account active/inactive/suspended
- rate limiting
- account lockout after repeated failed attempts
- password change
- password reset flow architecture
- optional MFA-ready design
- secure HTTP-only cookies where appropriate
- audit of authentication events

Seed an initial Team Leader from environment variables.

---

# SESSION AND BREAK MANAGEMENT

Agent Dashboard must show Start Session at the top.

No Agent can:
- Generate Lead
- Take Lead
- Call Customer
- Start Break

without active session.

Session statuses:
- ACTIVE
- ON_MANUAL_BREAK
- ON_IDLE_BREAK
- ENDED
- FORCE_CLOSED

Manual break:
- live counter
- disable Generate Lead and Take Lead
- keep current lead locked
- end break returns to active

Device-wide idle rule:
- after 5 minutes without device-wide mouse/keyboard activity
- count break from the last activity moment, not from minute five

Example:
- last activity 10:00
- threshold reached 10:05
- break start must be 10:00
- activity resumes 10:12
- duration = 12 minutes

A normal website cannot reliably monitor whole-device activity.

Therefore build:
- a Windows companion application
- secure device registration
- device token
- heartbeat endpoint
- last activity timestamp
- idle duration
- companion version
- device id

Do not record:
- key contents
- screenshots
- screen content
- opened file contents
- passwords

Break reporting:
- break count
- each break
- manual versus idle
- total manual
- total idle
- total daily
- longest
- average
- currently open break
- green when total <= 60 minutes
- red when total > 60 minutes

Filters:
- over one hour
- within one hour
- no breaks
- currently on break
- manual only
- idle only

Daily reset:
- at calendar-day boundary in Africa/Cairo
- never delete history

Attendance statuses:
- PRESENT
- WORKED_NO_BREAK
- VACATION
- ABSENT
- DAY_OFF
- PARTIAL_SESSION
- SESSION_NOT_CLOSED
- FORCE_CLOSED

Never classify a working employee with zero breaks as Vacation.

---

# LEAD TYPES

Separate pools:

- CASH
- INSURANCE

Separate:
- uploads
- batches
- permissions
- counters
- reports
- progress
- completed/remaining
- order-created count

Do not combine them except in overall summary.

---

# IMPORT SYSTEM

Support:
- XLSX
- XLS
- CSV

Required import flow:
1. upload file
2. choose type
3. detect sheet
4. select date format
5. map columns
6. validate
7. normalize
8. preview
9. show grouping result
10. show duplicates/errors
11. confirm
12. queue background processing
13. show progress
14. complete
15. download error file

Preview must show:
- total rows
- valid rows
- invalid rows
- duplicate rows
- previously imported rows
- invalid phones
- invalid dates
- missing required columns
- grouped lead count
- medication item count
- unknown columns
- sample normalized records

Import must be:
- idempotent
- retry-safe
- background processed
- auditable

Preserve:
- raw source row
- normalized fields
- import error
- source row number
- batch id

---

# INSURANCE LEADS

Use:

`docs/samples/med_gulf_sample.xlsx`

The file is item-level.

Do not create one lead per row.

Create:
- one lead header
- multiple medication child items

Preferred grouping:

`NATIONALID + claim_seq_id`

Fallback:

`normalized phone + INVOICENO + SERVICEDATE`

Preferred item unique key:

`inv_item_idm`

Fallback:

`claim_seq_id + code`

Map all columns exactly according to the Data Mapping workbook.

Store long identifiers as text:
- claim_seq_id
- invoice
- transaction
- policy
- payer id
- national id
- app reference
- preauthorization reference
- item keys
- UPC when leading zeros are possible

Do not expose medications in general Agent Leads Search.

---

# CASH LEADS

Use:

`docs/samples/cash_leads.xlsx`

Rows may repeat because each row is a medication.

Default grouping:

`normalized phone + source date + branch`

Create:
- one lead header
- multiple medication items

Source Agent:
- preserve as legacy/source agent label
- do not make live owner by default
- allow Admin option to preserve source assignment only when mapped to a valid user

Map:
- Agent
- Mobile Number
- Date
- Branch
- City
- Medication
- Quantity
- Price
- Status
- Date to be called
- Days to dispense
- Notes

Price:
- preserve raw
- parse `1.26K` as 1260

Date:
- require explicit format selection
- do not silently guess

Days to dispense:
- never trust imported text as source of truth
- calculate from date fields

Legacy status mapping:
- Answered - No Order -> ANSWERED_NO_ORDER
- No Answer or Busy -> NO_ANSWER_BUSY
- Reschedule call -> RESCHEDULE_FOLLOW_UP
- blank -> AVAILABLE

Preserve raw status.

---

# PHONE NORMALIZATION

Canonical:

`9665XXXXXXXX`

Equivalent inputs:
- 05XXXXXXXX
- 5XXXXXXXX
- 9665XXXXXXXX
- +9665XXXXXXXX
- nine-digit sample values beginning with 5

Process:
- trim
- remove non-digits
- normalize prefix
- validate length
- retain raw
- index normalized

---

# LEAD DISTRIBUTION

Generate Lead must:

1. verify active session
2. verify not on break
3. verify type/partner/shift permission
4. verify no active lead
5. select next eligible lead deterministically
6. atomically lock
7. create assignment history
8. set PENDING_CALL
9. return lead
10. prevent another Agent receiving it

Ordering:
1. batch priority
2. source row/group order
3. import timestamp
4. lead id tie-breaker

Concurrency safety:
- database transaction
- PostgreSQL row locking
- SKIP LOCKED or equivalent
- partial unique indexes
- one active assignment per lead
- one active assignment per Agent

Do not use frontend state or 15-second refresh as a lock.

---

# LEAD SEARCH

Search by:
- phone
- national identity

Agent search result may show:
- customer name
- masked phone
- masked identity
- lead type
- partner
- branch
- city
- current status
- active ownership state
- last contact
- callback eligibility
- family/household grouping

Must not show:
- medication names
- quantities
- pricing
- medical details
- insurance financial references

Household grouping:
- same normalized phone
- do not merge different national IDs into one person

---

# TAKE LEAD

Eligible only when:
- active session
- not on break
- Agent has no active lead
- authorized for type/partner
- lead has no active owner
- status AVAILABLE or CALLBACK_ELIGIBLE

Take Lead:
- atomic transaction
- new assignment history
- exclusive active lock
- PENDING_CALL
- preserve all prior history

Simultaneous Take Lead:
- only one Agent succeeds
- other gets conflict

---

# CALL CUSTOMER

When Agent clicks Call Customer:

- verify ownership
- verify session active
- create call-attempt placeholder
- timestamp action
- change PENDING_CALL to CUSTOMER_CONTACTED
- open disposition form

The click is not proof of an actual call.

Yeastar CDR verifies actual call later.

Provider call status and operational disposition must remain separate.

---

# DISPOSITIONS

Exact user-facing list:

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

Store:
- lead
- assignment
- Agent
- disposition
- notes
- timestamp
- conditional fields
- edit history
- audit history

---

# CONDITIONAL DISPOSITION RULES

## Order Created

Require:
- manually entered external order number
- no auto-generation
- unique
- backend constraint
- trim and normalize
- Agent cannot Generate another lead before save succeeds

Result:
- CONVERTED_TO_ORDER
- appear in converted leads report

Do not add order value in this phase.

## Already Dispensed / Approved&Dispensed

Require:
- last dispense date
- refill period 26 to 80 days

Calculate:

`next_refill_date = last_dispense_date + refill_period_days`

Show before save.

Include in:
- daily report
- refill report
- export
- lead profile
- future refill list

## Reschedule / Follow-up Requests

Require:
- follow-up date
- Morning or Evening
- optional time
- notes

Result:
- FOLLOW_UP_SCHEDULED
- keep assigned to same Agent
- not Take Lead eligible
- supervisor may reassign with required reason

## No Answer / Busy

Mandatory revised rule:

After Agent saves No Answer / Busy:

1. save attempt and disposition
2. close active assignment
3. preserve original Agent history
4. set CALLBACK_ELIGIBLE
5. active owner becomes null
6. lead becomes searchable immediately
7. another authorized Agent may Take Lead
8. do not create duplicate lead
9. new Take Lead creates new assignment
10. original call attempt remains visible
11. do not release before disposition is saved
12. do not apply this rule to Follow-up Scheduled

Reason:
the customer may call back and reach another Agent.

## Wrong Number

- INVALID_NUMBER
- preserve original
- notes
- supervisor may correct/reopen with audit

Other final dispositions normally close as COMPLETED.

---

# YEASTAR CDR

Use:

`docs/samples/yeastar_cdr_sample.xls`

Source columns:
- unnamed first column containing unique-looking CDR record id
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

Implement:
- upload
- staging
- preview
- validation
- timezone setting
- background processing
- progress
- idempotency
- raw storage
- mapped storage
- match report

Direction-aware rules:

Outbound:
- customer = Call To
- Agent extension = parse human endpoint from Call From

Inbound:
- customer = Call From
- Agent = final connected human extension from Call To, Reason, transfer chain or final leg

Do not treat these as Agents:
- IVR Duty Hours
- IVR Main Message
- Queue Tele
- Queue CC
- other IVR/Queue/system labels

Status mapping:
- ANSWERED
- NO ANSWER
- BUSY
- FAILED_OR_UNKNOWN

Preserve:
- raw status
- raw reason
- all durations
- raw row

Convert durations to seconds.

CDR timezone:
- Admin setting
- parse source timezone
- convert to UTC
- display Africa/Cairo

Relevant filtering:
- CDR may contain thousands of unrelated numbers
- normalize endpoints
- stage rows
- indexed join against lead phones
- process only relevant lead numbers into lead-call reports
- do not loop over all data in browser or application memory

Matching factors:
- normalized phone
- Agent extension
- assignment window
- session/shift window
- timestamp
- direction

Match statuses:
- MATCHED
- NOT_MATCHED
- AMBIGUOUS
- AGENT_MISMATCH
- OUTSIDE_ASSIGNMENT_WINDOW
- INVALID_PHONE
- UNMAPPED_EXTENSION

Never silently guess ambiguous matches.

Use CDR record id as idempotency key.

Fallback:
- deterministic hash

Same file uploaded twice:
- no duplicates

---

# ADMIN DASHBOARD

Navigation:

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

Global filters:
- today
- yesterday
- exact date
- range
- team
- shift
- Agent
- type
- partner
- batch
- disposition
- CDR verification

Overview:
- active Agents
- manual breaks
- idle breaks
- uploaded leads
- completed
- remaining
- completion percentage
- contacted
- verified calls
- unverified
- orders created
- over break limit

Cash and Insurance sections separately:
- total
- available
- assigned
- pending
- contacted
- callback eligible
- follow-up scheduled
- completed
- remaining
- percentage
- orders created
- all disposition counters

Agent performance:
- session start/end
- work time
- break time
- manual/idle
- break count
- generated
- Take Lead
- contacted
- completed
- initiated calls
- verified calls
- orders
- dispositions
- Cash/Insurance
- active lead
- last activity

Converted Leads:
- lead id
- type
- customer
- masked phone/identity
- Agent
- shift
- contact time
- external order number
- conversion date
- CDR verification
- provider status
- batch
- partner

---

# AGENT DASHBOARD

Must include:
- Start Session at top
- Egypt clock
- session timer
- break counter
- current status
- Cash/Insurance selection based on permission
- Generate Lead
- current lead card
- Call Customer
- disposition form
- Leads Search
- Take Lead
- personal daily counts
- personal break history
- 15-second live refresh fallback

---

# AUTO REFRESH

- WebSocket or SSE preferred
- 15-second polling fallback
- no full-page reload
- update only affected counters and data
- database remains locking authority

---

# BRAND THEME

Use uploaded logo.

Colors:
- Navy `#2A3144`
- Teal `#21A7A5`
- Deep Teal `#2A8B89`
- White `#FEFEFE`
- Soft Gray `#BBC1CB`
- Muted Slate `#6E7580`
- Light Background `#F4F7F8`
- Border `#D9DEE5`
- Text `#1F2937`

UI:
- navy sidebar
- logo top-left
- teal active navigation
- teal primary actions
- white cards
- navy headings
- compact professional layout
- no large empty margins
- separate Cash and Insurance visual hierarchy
- amber for Callback Eligible
- green for Completed and Order Created
- red only for errors and break > 1 hour
- accessible contrast
- keyboard support
- loading/empty/error states
- responsive desktop/tablet

---

# PERFORMANCE

Design for:
- 200 users
- concurrent Generate Lead
- concurrent Take Lead
- millions of leads
- large daily CDR
- large Excel
- daily/monthly reports

Use:
- server-side pagination
- indexes
- background jobs
- batch inserts
- retry-safe queues
- aggregation tables/materialized views where helpful
- caching
- no N+1
- archive strategy
- soft delete where appropriate
- backups
- audit logs

---

# SECURITY

Implement:
- backend RBAC
- backend team/shift scope
- masking
- no medication in Agent search response
- upload type/size validation
- safe storage
- rate limits
- IDOR protection
- audit logs
- HTTPS deployment
- secrets management
- no sensitive values in logs
- device token security
- CDR permissions
- import permissions

---

# DATABASE REQUIREMENTS

Create models for:

- User
- Role/permissions
- Team
- Shift
- ShiftSchedule
- UserLeadPermission
- WorkSession
- BreakEvent
- AttendanceDay
- DeviceRegistration
- ActivityHeartbeat
- LeadImportBatch
- LeadImportFile
- LeadImportRow
- LeadImportError
- ImportColumnMapping
- Lead
- Customer/Person
- LeadMedicationItem
- LeadAssignment
- LeadDisposition
- LeadFollowUp
- LeadOrderReference
- LeadStatusHistory
- LeadNote
- HouseholdGroup
- CdrImport
- CdrStagingRecord
- CdrRecord
- CallAttempt
- CallMatch
- ExtensionMapping
- AuditLog
- SystemSetting

Constraints:
- one active assignment per lead
- one active lead per Agent
- unique external order number
- unique CDR record id
- refill period 26–80
- normalized phone index
- identity index
- type/status/batch indexes
- assignment timestamps
- call timestamps
- source item uniqueness
- idempotent import keys

---

# TESTS

Required:

## Generate Lead concurrency
- at least 50 concurrent requests
- no duplicate lead
- one active lead per Agent

## Take Lead concurrency
- two Agents simultaneously
- one succeeds
- one conflicts

## No Answer / Busy
- Agent A owns
- saves disposition
- ownership released
- callback eligible
- Agent B takes
- Agent C cannot take
- Agent A history remains

## Follow-up
- remains owned
- not searchable for Take Lead
- supervisor can reassign

## Order Created
- mandatory external number
- duplicate rejected
- Agent blocked until complete

## Refill
- only 26–80
- correct date
- export contains it

## Phone normalization
- all equivalent forms

## Insurance grouping
- item rows become one lead
- long IDs exact

## Cash grouping
- repeated medication rows grouped
- ambiguous date requires selection
- price K parsing
- raw preserved

## CDR
- unrelated thousands ignored
- inbound/outbound correct
- IVR/Queue excluded
- duplicate import safe
- ambiguous remains ambiguous
- timezone respected

## Idle
- exact five-minute threshold behavior
- break starts from last activity

## Permissions
- Agent cannot see Admin data
- Shift Supervisor scope enforced
- hidden UI endpoint still blocked
- medication absent from Agent search API response

---

# REQUIRED DOCUMENTATION

Create:

- `README.md`
- `CLAUDE.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/SECURITY.md`
- `docs/implementation/IMPLEMENTATION_PLAN.md`
- `docs/implementation/IMPLEMENTATION_STATUS.md`
- `docs/deployment/LOCAL_SETUP.md`
- `docs/deployment/STAGING.md`
- `docs/deployment/PRODUCTION.md`
- `docs/testing/TEST_PLAN.md`
- `docs/release/UAT.md`
- `docs/release/OPERATIONS_RUNBOOK.md`
- `docs/release/ROLLBACK.md`
- `docs/release/PILOT_MONITORING.md`

---

# IMPLEMENTATION PROCESS

Build in reviewable phases.

At the beginning:

1. inspect supplied samples
2. inspect mapping workbook
3. write architecture and implementation plan
4. create repository structure
5. create database schema
6. create migrations
7. implement backend foundation
8. implement frontend foundation
9. implement worker
10. implement activity companion
11. implement features phase by phase
12. run tests
13. run lint
14. run typecheck
15. run build
16. document all incomplete items honestly

After each phase:
- show files changed
- show migrations
- show tests
- show commands run
- show remaining work
- commit when asked

Do not claim completion if tests/build fail.

Do not stop after scaffolding.

Continue until all MVP phases are implemented, tested and documented.

---

# EXPLICITLY DEFERRED

Do not implement yet:
- full Order Management
- order value
- order item lifecycle
- cancellation lifecycle
- sales revenue
- commissions
- sales forecasting
- financial dashboards
- external order-system integration beyond external order number

---

# FINAL ACCEPTANCE

The project is complete only when:

- the repository runs locally
- Docker starts required infrastructure
- login works
- roles work
- sessions work
- breaks work
- Generate Lead works atomically
- Take Lead works atomically
- Cash import works
- Insurance import works
- grouping works
- search hides medications
- dispositions work
- callback eligibility works
- refill works
- external order number works
- CDR import/matching works
- reports work
- auto refresh works
- Windows companion works
- tests pass
- lint passes
- typecheck passes
- production build passes
- documentation exists
- no dependency on old Milaserv 360 exists

Start now.

First read all supplied files, then create the architecture and implementation plan, then build the repository from scratch.
