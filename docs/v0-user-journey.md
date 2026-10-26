# Parable Proof V0: Exact User Journey

Source: Felix Awah, `Parable_Proof_v2.docx` (32 screenshots), transcribed by reading each screenshot.

This file has three parts:
- **Part A** is Felix's spec, transcribed as written. Nothing added.
- **Part B** is every decision made since: the defaults Felix approved, and the build decisions that resolve ambiguities in Part A.
- **Part C** lists items still waiting on Felix, and known V0 limitations.

If Part A and Part B disagree, Part B wins.

---

# Part A: The spec (as written by Felix)

## Product goal
Answer one question:

> Are any AI applications visible in our Microsoft 365 environment violating our approved AI-use policy?

V0 does **not** try to discover every AI tool in the company.

For the first paid version, use **uploaded Microsoft evidence**, not a live Microsoft connector. That keeps the build small and validates willingness-to-pay first.

## Screen 0: Landing / Login
**Display:** "Parable Proof", subtitle "Evidence-Backed AI & Security Verification".
**Buttons:** `Start Verification`, `Sign In`
**User action:** clicks Start Verification.
**Backend:** create/login account.
**Output:** user lands on **New AI Access Check**.

## Screen 1: Create AI Access Check
**User sees:** New AI Access Check

| Field | Type | Required |
|---|---|---|
| Company name | Text | Yes |
| Review name | Text | Yes |
| Review date | Auto | Yes |
| Reviewer name | Text | Yes |

**Default review name:** `October 2026 AI Policy Check`
**Button:** `Continue`
**User action:** completes fields, clicks Continue.
**Backend:** create
```
review_id
company_id
review_name
reviewer
created_at
status = DRAFT
```
**Output:** move to Policy Setup.

## Screen 2: Define the AI Policy
This is critical. We do **not** let an LLM decide the company's policy. The company must approve explicit rules.

**User sees:** Step 1 of 3: Your Approved AI Policy
Two options: `Upload Existing Policy` or `Add Rules Manually`

### Option A: Upload policy
**Accepted:** PDF, DOCX
**User clicks:** `Upload Policy`, selects `Company_AI_Policy.pdf`
**Backend:** store original document.
For V0: **Parable staff manually converts the policy into structured rules.** Later this can be automated.
The system produces a draft rule table. Example:

| AI Application | Status | Approved Users | Allowed Access |
|---|---|---|---|
| Microsoft Copilot | Approved | All employees | M365 |
| ChatGPT Enterprise | Conditional | Marketing, Research | No client files |
| Otter AI | Prohibited | None | None |

**User sees:** Review Your Policy Rules
**Buttons on every row:** `Edit`, `Delete`
**Bottom button:** `+ Add AI Application`
**Final button:** `Approve Policy Rules`

**Important:** nothing proceeds until the CCO clicks **Approve Policy Rules**. This creates accountability.

### Exact policy-rule structure
Every app has:
```
app_name
approval_status
approved_users
approved_departments
allowed_permissions
prohibited_permissions
notes
```
`approval_status` can only be: `APPROVED`, `CONDITIONAL`, `PROHIBITED`

Example:
```
app_name = Otter AI
approval_status = PROHIBITED
approved_users = NONE
allowed_permissions = NONE
prohibited_permissions = ALL
```
Another:
```
app_name = ChatGPT Enterprise
approval_status = CONDITIONAL
approved_department = Marketing
prohibited_permissions = Files.Read
```

## Screen 3: Upload Microsoft Evidence
**User sees:** Step 2 of 3: Add Microsoft Evidence
**Explanation:** "Upload evidence showing third-party applications and permissions currently authorized in your Microsoft environment."
**Buttons:** `Download Export Instructions`, `Upload Microsoft Evidence`

### V0 evidence format
CSV. The evidence table must contain:
```
user_email
app_name
app_id
permission_scope
consent_type
resource_name
observed_at
```
Example:

| User | App | Permission | Consent |
|---|---|---|---|
| sarah@firm.com | Otter AI | Files.Read | User |
| james@firm.com | ChatGPT | Files.Read | User |
| firm-wide | Copilot | M365 | Tenant |

**User action:** uploads `Microsoft_AI_Access.csv`, clicks `Validate File`.

### Backend validation
Before doing any compliance analysis, check:
- file format valid?
- required columns present?
- rows readable?
- duplicate records?
- timestamp present?
- blank application names?
- malformed email addresses?

**If bad:** display "We couldn't process 4 rows." Show errors. Buttons: `Download Error File`, `Upload Corrected File`.
**If valid:** display "236 application-access records imported successfully." Button: `Run AI Policy Check`.

## Screen 4: Backend Verification
User clicks **Run AI Policy Check**. Now the deterministic engine starts. There are four checks.

### Rule 1: Prohibited application
Evidence: `Otter AI`. Policy: `Otter AI = PROHIBITED`.
**Result:** POLICY EXCEPTION. **Reason:** "Prohibited AI application detected."

### Rule 2: Unknown AI application
Evidence contains a known AI application. No matching policy entry exists.
**Result:** REVIEW REQUIRED. **Reason:** "AI application observed but no approved policy rule exists."
Important distinction: **Unknown ≠ violation.** We do not accuse the company of violating a policy that does not exist.

### Rule 3: Unauthorized user
Policy: `ChatGPT Enterprise`, `Approved department = Marketing`.
Evidence: `User = Sarah`, `Department = Finance`.
**Result:** POLICY EXCEPTION. **Reason:** "User is outside the approved population."
If V0 does not have reliable department data, **do not run this rule**.

### Rule 4: Prohibited permission
Policy: `ChatGPT`, `prohibited_permission = Files.Read`.
Evidence: `ChatGPT`, `permission_scope = Files.Read`.
**Result:** POLICY EXCEPTION. **Reason:** "Application has a permission prohibited by company policy."

### Important backend rule
The engine evaluates:
```
POLICY RULE
  ↓
OBSERVED MICROSOFT EVIDENCE
  ↓
DETERMINISTIC COMPARISON
  ↓
RESULT
```
Never:
```
LLM opinion
  ↓
Compliance decision
```

## Screen 5: Results
**Header:** AI Policy Check, October 19, 2026
**Summary:** 12 AI applications reviewed. 7 compliant. 3 policy exceptions. 2 require review.

**Main table:**

| Application | User | Permission | Policy | Result |
|---|---|---|---|---|
| Copilot | Firm-wide | M365 | Approved | Compliant |
| ChatGPT | Mark | Files.Read | Conditional | Exception |
| Otter AI | Sarah | Files.Read | Prohibited | Exception |
| Fireflies | John | Calendar.Read | No rule | Review |

**Filters:** `All`, `Exceptions`, `Review Required`, `Compliant`

## Screen 6: Exception Detail
User clicks `Otter AI`. A side drawer opens.

**Display:**
- **Otter AI**
- **Result:** POLICY EXCEPTION
- **Why:** "Otter AI is prohibited under your approved AI policy but currently has access within your Microsoft environment."
- **Evidence:**
  ```
  User: sarah@firm.com
  Application: Otter AI
  Application ID: XXXXX
  Permission: Files.Read
  Consent: User
  Observed: October 18, 2026
  ```
- **Policy rule:**
  ```
  Otter AI
  Status: PROHIBITED
  Approved users: None
  ```
**Buttons:** `Mark Resolved`, `Update Policy`, `Add Note`

### What these buttons do
**Mark Resolved:** user must enter
```
resolution_note
resolved_by
resolved_at
```
Example: "Application access removed by IT on October 20." The original exception remains in history. **Never delete it.**

**Update Policy:** takes user back to the policy rule. Important: changing policy does **not** retroactively erase the original finding.

**Add Note:** allows e.g. "IT investigating with employee." Stores note + author + timestamp.

## Screen 7: Final Evidence Report
**Top-right button:** `Generate Compliance Report`. User clicks. Backend freezes the review snapshot. Generate PDF.

**PDF contains:**
- Title: Parable Proof: AI Policy Compliance Check
- Company, Review date, Reviewer
- **Executive summary:** 12 AI applications reviewed, 7 compliant, 3 policy exceptions, 2 require review
- **Findings.** For every exception: AI application, affected user, observed permission, relevant policy rule, evidence source, timestamp, status, remediation note
- **Scope statement (very important):**
  > Parable evaluated AI applications identifiable within the Microsoft evidence supplied for this review. This report does not represent complete discovery of all AI usage across the organization.

**Button:** `Download PDF`

## What the database needs
Only six core objects:
```
companies
users
reviews
policy_rules
evidence_records
findings
```
A `finding` should contain:
```
finding_id
review_id
app_name
user_email
observed_permission
policy_rule_id
result
reason
evidence_record_id
created_at
resolution_status
resolution_note
```

## Result taxonomy
Keep it to **three states**.
- **COMPLIANT:** evidence matches approved policy.
- **POLICY EXCEPTION:** evidence contradicts an explicit policy rule.
- **REVIEW REQUIRED:** Parable has evidence but cannot make a deterministic comparison.

Do **not** add VERIFIED / UNKNOWN / STALE yet. Those belong to the broader Parable Proof vision. They make this V0 unnecessarily complicated.

---

# Part B: Decisions approved by Felix (October 2026)

1. **App matching.** Policy rules also store the Microsoft `app_id`, so "ChatGPT" and "ChatGPT Enterprise" are not confused. Match on `app_id`. Name-only matching is a fallback and produces REVIEW REQUIRED.
2. **Two roles, one app.** `parable_staff` converts the policy into rules and can see all companies. `customer` (the CCO) approves rules, uploads evidence, resolves findings, and sees only their own company. The customer is notified when draft rules are ready to approve.
3. **Re-runs.** A new evidence upload starts a new review. A finalized review and its report are frozen and never change.
4. **Known AI apps (Rule 2).** Parable maintains a starter list of about 50 known AI applications.
5. **Evidence CSV.** Microsoft does not export these 7 columns directly. `Download Export Instructions` provides a script that builds the CSV from Microsoft Graph.
6. **Department data (Rule 3).** The CSV gets an optional `user_department` column. If it is empty, the department part of Rule 3 does not run.
7. **CONDITIONAL apps (Rule 4).** A permission that is neither allowed nor prohibited gives REVIEW REQUIRED.
8. **Summary counts (Screen 5).** "AI applications reviewed" counts apps, not rows. An app counts as an exception if any of its rows is an exception.
9. **Data.** US hosting. Uploaded files deleted 90 days after the report. No billing in V0.

Additional decisions (October 2026, made by Arafat with Felix's approval to "go with what is safe, works and doesn't break"):

**Accounts and access**
- **Sign-in only.** No public signup. Parable creates every account. `Start Verification` on Screen 0 goes to sign-in.
- **Several customer logins per company** (e.g. CCO and IT), all with the same customer permissions.
- **No company name field on Screen 1.** The company comes from the signed-in user's account.

**Policy rules**
- The rule field is `approved_departments` (a list: one app can be approved for several departments). The evidence column is `user_department` (singular: one user has one department).
- The example table on Screen 2 is only a display example. The 7-field structure is authoritative.
- **Customers can add, edit and delete rules** (Add Rules Manually). Parable staff can do the same after converting an uploaded policy. Nothing runs until the CCO clicks Approve Policy Rules.
- **Policy rules belong to the company**, not to one review. Each finding stores a frozen copy of the rule as it was at check time.
- **Update Policy** (Screen 6) opens the exact rule that produced the finding. An edited rule needs CCO approval again. The current review and its findings do not change. The new rule applies to the next review. The user should then Mark Resolved with a note explaining the policy change.
- **Known AI app list** (Rule 2) is maintained by Parable staff only, one shared list for all customers.

**App matching**
- Staff enter the Microsoft `app_id` on each rule, copied from the evidence CSV.
- The engine matches evidence to rules by `app_id` first. A different `app_id` is a different app, even if the name is similar.
- If a rule has no `app_id`, the engine matches by exact name (ignoring capitalization) and the result is REVIEW REQUIRED, never a confident verdict.

**Evidence validation**
- **Duplicates** are rows in the uploaded CSV with the same `user_email` + `app_id` + `permission_scope` + `consent_type` + `observed_at`. Keep one copy, show "N duplicate rows ignored" in the import message, and list them in the error file. Duplicates do not block the upload.
- **Tenant-wide rows:** when `consent_type` is Tenant (admin consent), `user_email` may be blank or `firm-wide`. Otherwise it must be a valid email. (Pending Felix, default yes.)

**Engine**
- **Non-AI apps** that are neither in the policy nor on the known AI list are excluded from results and counts. (Pending Felix, default yes.)
- **Rule 3:** if `approved_users` lists emails, users outside the list give POLICY EXCEPTION even without department data. Only the department comparison is skipped when `user_department` is empty. (Pending Felix, default yes.)
- **Decision path per evidence row:**

| Policy status | Check, in order | Result |
|---|---|---|
| PROHIBITED | none | POLICY EXCEPTION |
| APPROVED | user outside approved users/departments | POLICY EXCEPTION |
| | permission on prohibited list | POLICY EXCEPTION |
| | otherwise | COMPLIANT |
| CONDITIONAL | user outside approved users/departments | POLICY EXCEPTION |
| | permission on prohibited list | POLICY EXCEPTION |
| | permission on allowed list | COMPLIANT |
| | permission on neither list | REVIEW REQUIRED |
| No rule, known AI app | none | REVIEW REQUIRED |
| No rule, not an AI app | none | excluded |

**Findings and reports**
- **Mark Resolved:** the signed-in user types `resolved_by`. The system also records which account clicked, automatically. The typed name is for display; the recorded account is the proof.
- **Notes** (Add Note) are stored in their own table, `finding_notes`, append-only and never edited or deleted. This is a seventh table beyond the six listed.
- **Report findings section** lists POLICY EXCEPTION findings only. REVIEW REQUIRED and COMPLIANT appear in the summary counts.
- **Review statuses:** `DRAFT` → `RULES_PENDING_APPROVAL` → `RULES_APPROVED` → `EVIDENCE_VALIDATED` → `RESULTS_READY` → `FINALIZED`.

---

# Part C: Open items

Waiting on Felix (built with the default above until he says otherwise):
1. Tenant-wide rows may have `firm-wide` or blank instead of an email.
2. Non-AI apps are excluded from results and counts.
3. Rule 3 still checks the approved-users email list when department data is missing.

Known limitation in V0 (not a bug):
- To see a policy change take effect, the customer creates a new review and uploads the evidence again. A later version can add "Re-run with updated policy" that reuses the same evidence.
