# Parable Proof V0: Demo Test Cases

One converted evidence file, `converted-demo-all-cases.csv`, triggers **every outcome the engine can produce** in a single run. A second file, `converted-missing-column.csv`, shows a whole-file rejection. The negative cases at the end show the security and integrity guards.

All data is fake (`example.com`). Use it only with the **Meridian Wealth Partners (Demo)** company.

---

## Part 1: One-time setup (do this before the demo, in order)

### A. Copy the files into the repo
Put both CSVs in `fixtures/demo/` and this guide next to them.

### B. Add two app catalog entries (Supabase SQL Editor)
```sql
insert into public.app_catalog (app_name, app_id, classification) values
  ('Fireflies', 'a1b2c3d4-0000-4000-8000-000000000005', 'AI'),
  ('Zoom',      'a1b2c3d4-0000-4000-8000-000000000007', 'NOT_AI')
returning app_name, classification;
```
Expected: 2 rows. (Fireflies = known AI with no rule. Zoom = not AI, so it is excluded.)

### C. Add one rule with no app ID (as Meridian, in the app)
On any open review's policy page: **+ Add AI Application**
- App name: `Perplexity`
- Status: **Approved**
- Tick **Approved for all**
- Leave **App ID and service principal ID empty** (this is the point: it can only match by name)
- Save, then **Approve Policy Rules**

### D. Check the Meridian rules
The policy page should show 4 rules, all **Approved**:

| Rule | Status | App ID | Who | Allowed | Prohibited |
|---|---|---|---|---|---|
| ChatGPT Enterprise | Conditional | ...0003 | Marketing, Research | None | Files.Read |
| Microsoft Copilot | Approved | ...0002 | marketing (department) | All | None |
| Otter AI | Prohibited | ...0001 | None | None | All |
| Perplexity | Approved | (none) | Everyone | None | None |

---

## Part 2: The happy-path run

1. **Customer:** New AI Access Check, then Approve Policy Rules, then upload `fixtures/sample-export.csv` as the Microsoft export.
2. **Staff:** open the review, upload `converted-missing-column.csv` first (rejected, see Part 4), then `converted-demo-all-cases.csv`.
   - Expected import: **12 records imported, 1 duplicate row ignored**.
3. **Customer:** Run AI Policy Check.

### Expected results (11 findings; Zoom produces none)

| CSV row | App | User | Permission | Expected result | What it demonstrates |
|---|---|---|---|---|---|
| 2 | Otter AI | sarah | Files.Read | **POLICY EXCEPTION** | Prohibited app |
| 3 | ChatGPT Enterprise | james (Marketing) | Files.Read | **POLICY EXCEPTION** | Approved department, but the permission is prohibited |
| 4 | ChatGPT Enterprise | priya (Research) | Calendar.Read | **REVIEW REQUIRED** | Permission on neither list: review, not an accusation |
| 5 | ChatGPT Enterprise | tom (Finance) | Mail.Read | **POLICY EXCEPTION** | User outside the approved departments |
| 6 | ChatGPT Enterprise | alex (Marketing) | Mail.Read Files.Read | **POLICY EXCEPTION** | Multi-permission row: one prohibited permission taints the row |
| 7 | Microsoft Copilot | Firm-wide | Mail.Read | **COMPLIANT** | Tenant-wide consent skips the user check |
| 8 | Microsoft Copilot | maria (marketing) | Sites.Read.All | **COMPLIANT** | Department matched ignoring capitalization |
| 9 | Microsoft Copilot | lee (no department) | Mail.Read | **COMPLIANT** (reason says department not checked) | Missing department skips only the department check |
| 10 | Fireflies | dana | Calendar.Read | **REVIEW REQUIRED** | Known AI app with no policy rule |
| 11 | Mystery AI | ravi | Mail.Read | **REVIEW REQUIRED** | Unclassified app: staff must classify it |
| 12 | Zoom | ops | User.Read | **Not shown** | Not an AI app: kept in the evidence, excluded from results |
| 13 | Perplexity | nina | User.Read | **REVIEW REQUIRED** | Rule has no app ID, so a name-only match is never trusted |
| 14 | Otter AI | sarah | Files.Read | **Not imported** | Exact duplicate of row 2 |

### Expected summary line
**6 AI applications reviewed. 1 compliant. 2 policy exceptions. 3 require review.**
- Compliant: Copilot. Exceptions: Otter, ChatGPT. Review: Fireflies, Mystery AI, Perplexity.
- The tabs count findings, not apps: Exceptions 4, Review Required 4, Compliant 3.

### Talking points for the trickiest rows
- **Row 6:** Microsoft lists a user's consented permissions in one field. Reading it as one value would have let a prohibited permission slip through as compliant.
- **Row 9:** We never claim something we couldn't check. The reason says so, and the report inherits it.
- **Row 13:** Perplexity is clearly approved, yet the result is Review. Without the Microsoft app ID, a lookalike app with the same name could be approved by accident. Fix: add the app ID to the rule.

---

## Part 3: Exception detail and the report

1. Open **Tom / ChatGPT** (unauthorized user): add a note, then Mark Resolved with a typed name different from the account. Show "Recorded account."
2. Open **Lee / Copilot**: point at the reason's "department was not checked" note.
3. Open **Perplexity**: the policy rule shows "Matched by: Application name only (ID not confirmed)."
4. **Generate Compliance Report**. The panel shows the number of open findings. Finalize, download the PDF, and show the exceptions, both resolver names and both fingerprints.

---

## Part 4: Negative cases (the guards)

| Case | How | Expected |
|---|---|---|
| Fake file type | Upload `fixtures/fake.pdf` as the policy | "This file is not a valid PDF." Real file unchanged |
| Missing column | Staff upload `converted-missing-column.csv` | File-level error: missing required column `app_id`. Nothing imported |
| Row-level errors | Staff upload `fixtures/evidence/converted-invalid.csv` | 6 errors by row and column, error file download, nothing imported |
| Formula injection | Open that error file in Excel | `'=HYPERLINK(...)` shows as plain text, not a live link |
| Unapproved rule | Edit any rule, don't approve, click Run | "Some policy rules are waiting for approval..." |
| Cross-company access | Copy a results link, open it as Harbor | "Review not found" (404) |
| Customer on staff page | As Meridian, open `/staff/reviews/<id>` | Sent back to `/reviews` |
| Double resolve | Same finding in two tabs, resolve in both | Second tab: "already resolved or can't be resolved" |
| Re-run after work | Add a note, then Run again | "Findings already have notes or resolutions..." |
| After finalize | Open any finding | "This review is finalized." No actions |

---

## Reset notes
- Each full run finalizes a review, so every demo run uses a **new review**. Old ones stay listed; that's fine for a demo.
- The catalog rows and the Perplexity rule only need to be added once.
