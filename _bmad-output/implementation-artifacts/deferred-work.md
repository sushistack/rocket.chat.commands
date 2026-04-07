# Deferred Work

## From review of spec-rc-plane-slash-commands

- **Configurable timezone**: Currently KST (+9) is hardcoded. If app is used in non-Korean workspace, all date calculations will be wrong. Add a `TIMEZONE_OFFSET_HOURS` app setting.
- **UIKit button double-click race condition**: Read-modify-write on defer_count/state has no optimistic locking. Plane API doesn't support conditional updates. Consider disabling buttons after click via client-side JS or using confirm dialogs as serialization barrier.
- **Button label emoji truncation**: `substring(0, 75)` can split mid-surrogate-pair. Use a Unicode-aware truncation helper.
- **Action authorization**: Any user who can trigger a block action can mutate any issue. Add authorization check (verify user is assignee or has admin role).
