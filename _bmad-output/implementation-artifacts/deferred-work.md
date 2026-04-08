# Deferred Work

## From review of spec-rc-plane-slash-commands

- **Configurable timezone**: Currently KST (+9) is hardcoded. If app is used in non-Korean workspace, all date calculations will be wrong. Add a `TIMEZONE_OFFSET_HOURS` app setting.
- **UIKit button double-click race condition**: Read-modify-write on defer_count/state has no optimistic locking. Plane API doesn't support conditional updates. Consider disabling buttons after click via client-side JS or using confirm dialogs as serialization barrier.
- **Button label emoji truncation**: `substring(0, 75)` can split mid-surrogate-pair. Use a Unicode-aware truncation helper.
- **Action authorization**: Any user who can trigger a block action can mutate any issue. Add authorization check (verify user is assignee or has admin role).

## From review of spec-dailyforge-cron-redesign-and-enhancements

- **Empty catch blocks**: Scheduler top-level `catch (error) {}` and step1's per-issue `catch {}` swallow errors silently. Add logging via Apps Engine logger.
- **N+1 API calls in step1**: For every project: listLabels + listIssues, then 4 API calls per label-switch per issue. Consider batch operations or caching.
- **`todayString()` vs `todayKST()` duplication**: Two identical KST date implementations in `formatters.ts` and `PlaneClient.ts`. Consolidate to one.
- **`'deferred'` state substring matching**: `state.name.toLowerCase().includes('deferred')` could match unintended states like "Not Deferred". Consider matching by exact name or state ID.
