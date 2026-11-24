# Reconciliation contracts

## Input and source preservation

Every nonempty data row after the explicitly selected header becomes a normalized record or an invalid finding. Selected pre-header/title rows are explicitly excluded; fully blank rows are ignored. Every retained row has a unique internal identifier, source filename, worksheet, row number, SHA-256 file hash and original cells. A run checks record conservation before returning.

Amount strings are parsed under a selected number locale, validated against the currency's minor-unit precision and calculated with decimal.js. No JavaScript Number arithmetic determines customer financial results. Chart heights are bounded visual ratios; synthetic fixture generation may use ordinary numbers. Currency symbols alone are not silently interpreted. Invalid values and excess imported fractional digits are reported rather than rounded.

Periods use YYYY-MM. Calendar dates use explicit YMD/DMY/MDY conventions, with ISO dates always accepted. Date-only source values are not shifted across time zones. Audit presentation can use the configured reporting zone. Leading zeros, punctuation and case in identifiers are preserved unless the user explicitly disables case sensitivity.

## Matching

Currency is always part of a composite key. The default key is policy + carrier + period. The user may add/choose agent, transaction ID, date or premium; at least a policy or transaction identifier is required. Matching is exact, not probabilistic.

One expected row can collect multiple distinct payment rows. Multiple expected rows under the same key are ambiguous; the engine does not guess allocations. Cross-currency comparisons are never pooled and no FX conversion is performed.

Payments with repeated transaction IDs within a carrier/currency, or indistinguishable payment fingerprints without IDs, are duplicate candidates. All candidates are quarantined from confident allocation. Related expected entries become ambiguous. Duplicate candidates remain in raw imported cash totals, preventing silent row removal or false certainty. Distinct valid transaction IDs can legitimately share the same amount/date.

Corrections require changed mappings/rules or corrected source files and a new run. Review decisions do not alter amounts or confidence classifications. Local audit notes can be changed outside the application by a device owner; this is not tamper-resistant evidence.

## Financial definitions, per currency

| Metric                     | Definition                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expected                   | Sum of valid expected records, including unresolved/ambiguous groups.                                                                                                                         |
| Received                   | Sum of all valid signed payment records, including duplicate candidates.                                                                                                                      |
| Duplicate candidate amount | Sum of quarantined candidate payment rows.                                                                                                                                                    |
| Eligible received          | Received minus duplicate candidate amount. This is not necessarily allocated.                                                                                                                 |
| Total variance             | Received minus expected.                                                                                                                                                                      |
| Confirmed signed variance  | Received minus expected on unambiguous underpaid/overpaid groups outside tolerance. “Confirmed” means arithmetic evidence from imported records, not legal confirmation of a carrier debt.    |
| Underpayments              | Absolute negative variance on unambiguous underpaid groups.                                                                                                                                   |
| Potential outstanding      | Underpayments plus positive missing expected entries with a due date on/before the review date. Does not include ambiguous allocation. Coverage and carrier evidence may still be incomplete. |
| Unmatched payments         | Signed payments lacking an expected record, including unmatched reversals.                                                                                                                    |
| Review completion          | Matched findings plus findings explicitly marked resolved/accepted, divided by findings. This is a review-workflow metric, not proof of cash collection.                                      |

Negative transactions remain signed and classify as reversal/clawback for investigation. They are not automatically treated as ordinary underpayments. A missing payment is always described as absent from the supplied statements; complete coverage and due dates strengthen evidence without proving nonpayment.

## Rules

Percentage: `premium × rate / 100`. Fixed: configured amount. Progressive tier: rate on each band's portion, with explicit maximum coverage. A negative premium uses the same progressive bands and a negative base.

Final amount: `((base − fee) × (1 + taxRate / 100) + adjustment) × split / 100`, rounded once using half-up, half-even or toward-zero to the currency precision. The tax/fee basis is explicit, not market-specific. Choose separate carrier profiles for renewal/one-time schedules; event-specific rule routing is not automatic.

In import, selecting a saved expected rule only calculates rows when the expected commission amount column is unmapped. Premium must be mapped, currency must agree with the rule configuration, and the run stores the rule/version. Already supplied expected amounts are never silently replaced.

## Boundaries

The engine establishes consistency within supplied evidence. It does not verify contracts, premiums, carrier policies, statement completeness, legal recoverability, taxes owed or real-world payment status. Country/carrier compatibility requires representative files. XLSX formulas are not executed; recalculate and save cached values first. Numeric Excel identifiers may have already lost leading zeros before import.
