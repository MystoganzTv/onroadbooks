# Dispatcher records

Loads have optional `sourceKind` (SELF, DISPATCHER, BROKER_DIRECT, OTHER) and
`sourceName`. Historical loads remain unspecified. Attribution never changes
dispatch fees or the paying broker. Omitted fields from older clients preserve
the stored attribution; explicit null clears it.

`/dispatchers` groups dispatcher-attributed loads by the normalized source name,
as the broker directory groups loads by company name. Names typed on a load are
visible immediately; optional profiles add phone, email and notes. Renaming a
profile updates its loads in the same business and transaction. Profiles and
writes use the existing business scope and manage_loads permission.

Recorded commissions include the load's dispatch fee and additional linked
dispatch expenses without counting generated expense rows twice. All recorded
loads are included. This is a personal record, not a payment ledger or an unpaid
balance. There is no paid/unpaid status, transfer or automatic payment.

The new source fields are included in load exports and mobile API responses.
Existing native binaries preserve these fields when editing other load details;
the new directory and source controls are web features.
