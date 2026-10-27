# Parable Proof V0: Exact User Journey

Source: Felix Awah, `Parable_Proof_v2.docx` (32 screenshots), transcribed by reading each screenshot.

This file has three parts:
- **Part A** is Felix's spec, transcribed as written. Nothing added.
- **Part B** is every decision made since: the defaults Felix approved, and the build decisions that resolve ambiguities in Part A.
- **Part C** lists open items and known V0 limitations.

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

# Part B: Decisions (October 2026)

Sources: Felix's replies to the open questions, and build decisions made with Felix's approval to "go with what is safe, works and doesn't break." Where Felix changed an earlier default, his version is used.

## Accounts and access
- **One sign-in system, two roles:** `parable_staff` and `customer_admin` (the CCO or a delegated admin). No employee login in V0.
- **Sign-in only.** No public signup. Parable creates every account. `Start Verification` on Screen 0 goes to sign-in.
- **More than one customer_admin per company is allowed** (for example the CCO plus IT), all with the same permissions.
- **No company name field on Screen 1.** The company comes from the signed-in user's account.
- Parable staff can see all companies. A customer_admin sees only their own company.

## Policy rules (Screen 2)
- Each rule stores `app_name`, the Microsoft `app_id`, and the Microsoft service principal / object ID (`service_principal_id`) when available.
- The rule field is `approved_departments` (a list). The evidence column is `user_department` (singular: one user has one department).
- The example table on Screen 2 is a display example. The 7-field structure is authoritative.
- **Parable staff structure the uploaded policy into rules. The customer_admin reviews, edits, adds, deletes and approves them.** Nothing runs until the CCO clicks Approve Policy Rules.
- **Policy rules belong to the company**, not to one review. Each finding stores a frozen copy of the rule as it was at check time.
- **Update Policy** (Screen 6) opens the exact rule that produced the finding. An edited rule needs CCO approval again. The current review and its findings do not change. The new rule applies to the next review. The user should then Mark Resolved with a note explaining the policy change.

## Evidence (Screen 3)
- **The customer uploads the Microsoft export as Microsoft provides it.** Parable converts it into the evidence schema. A nontechnical CCO should not have to run scripts.
- **In V0, the conversion is done by Parable staff**, the same way staff structure the policy. Staff upload the converted file, and the system validates it. Automated converters for specific Microsoft export formats come later, once real customer exports show which formats repeat.
- The original raw upload is stored alongside the converted evidence for traceability.
- **Tenant-wide assignments:** `user_email` is null, and `assignment_scope` is `TENANT`. User-level assignments have `assignment_scope` = `USER` and a valid `user_email`. Never put text like "firm-wide" in the email field.
- **Duplicates** are rows with the same `user_email` + `app_id` + `permission_scope` + `consent_type` + `observed_at`. Keep one copy, show "N duplicate rows ignored" in the import message, and list them in the error file. Duplicates do not block the upload.
- **Every new evidence upload creates a new review (version).** Previous reviews are immutable.

## App classification (Rule 2)
- Parable maintains an **app catalog** (staff only, shared across all customers). Each app is classified `AI` or `NOT_AI`.
- **An unfamiliar app is never assumed to be AI.** An app that is not in the policy and not in the catalog is `UNCLASSIFIED`. It gives REVIEW REQUIRED, and Parable staff classify it.
- **Build decision:** staff classify unfamiliar apps during the evidence conversion step, so customers rarely see unclassified apps. UNCLASSIFIED → REVIEW REQUIRED remains as the safety net.
- **Non-AI apps** stay in the imported evidence for traceability but are excluded entirely from results, findings and counts.

## Engine (Screen 4)
- Match evidence to rules by `app_id` (or `service_principal_id`) first. A different ID is a different app, even if the name is similar. If a rule has no ID, match by exact name (ignoring capitalization) and the result is REVIEW REQUIRED, never a confident verdict.
- **Rule 3:** if `user_department` is missing, skip only the department check. Still enforce any explicit `approved_users` email list.
- **Decision path per evidence row:**

| Situation | Check, in order | Result |
|---|---|---|
| Rule says PROHIBITED | none | POLICY EXCEPTION |
| Rule says APPROVED | user outside approved users / departments | POLICY EXCEPTION |
| | permission on prohibited list | POLICY EXCEPTION |
| | otherwise | COMPLIANT |
| Rule says CONDITIONAL | user outside approved users / departments | POLICY EXCEPTION |
| | permission on prohibited list | POLICY EXCEPTION |
| | permission on allowed list | COMPLIANT |
| | permission on neither list | REVIEW REQUIRED |
| No rule, catalog says AI | none | REVIEW REQUIRED |
| No rule, not in catalog (UNCLASSIFIED) | none | REVIEW REQUIRED |
| No rule, catalog says NOT_AI | none | excluded |

Tenant-wide rows (`assignment_scope` = TENANT) skip the user and department checks, since there is no single user.

## Results (Screen 5)
- The summary counts unique applications. If any row for an app is an exception, the app counts as an exception in the summary. The detailed table still shows every affected user and permission.

## Findings and reports (Screens 6 and 7)
- **Mark Resolved:** the signed-in user types `resolved_by`. The system also records which account clicked. The typed name is for display; the recorded account is the proof.
- **Notes** (Add Note) are stored in their own table, `finding_notes`, append-only.
- **Report findings section** lists POLICY EXCEPTION findings only. REVIEW REQUIRED and COMPLIANT appear in the summary counts.

## Review statuses
`DRAFT` → `RULES_PENDING_APPROVAL` → `RULES_APPROVED` → `EVIDENCE_SUBMITTED` (raw export uploaded, waiting for Parable conversion) → `EVIDENCE_VALIDATED` → `RESULTS_READY` → `FINALIZED`

## Data
- US hosting. No billing in V0.
- **Raw uploaded files** (the policy document and the original Microsoft export) are deleted 90 days after the report.
- **Reviews, converted evidence records, findings, notes and reports are retained** unless the customer deletes the review. Converted evidence records are kept because findings point to them as proof.
- Deletion is a deliberate action by a customer_admin for a whole review. Nothing is deleted by cascade or by accident.

## Database tables
The six objects from Part A, plus three: `finding_notes` (Add Note), `app_catalog` (AI / NOT_AI classification), and policy and evidence file details stored on `reviews`.

---

# Part C: Open items

No decisions are waiting on Felix.

Known V0 limitations (not bugs):
- To see a policy change take effect, the customer creates a new review and uploads the evidence again. A later version can add "Re-run with updated policy" that reuses the same evidence.
- Evidence conversion is a manual Parable staff step for every review until automated converters are built.
