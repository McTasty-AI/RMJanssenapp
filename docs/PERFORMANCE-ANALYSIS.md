# Performance Analysis & Optimizations

## Slow Query Analysis (November 2025)

### Top Performance Issues

#### 1. Realtime Queries (47% + 46% = 93% of total time)
- **Query**: `realtime.list_changes` and WAL parsing
- **Calls**: 652k + 611k = 1.26M calls
- **Mean Time**: 4.26ms + 4.46ms
- **Status**: ✅ **Normal** - These are Supabase Realtime queries for live subscriptions. This is expected behavior for real-time features.

#### 2. Status Filter Queries (Optimized)
- **Tables**: `weekly_logs`, `declarations`, `leave_requests`
- **Issue**: Queries filtering by `status` without indexes
- **Calls**: 2,550 + 2,726 + 2,727 = 8,003 calls
- **Mean Time**: 4.14ms, 1.39ms, 1.03ms
- **Status**: ✅ **Fixed** - Added indexes on `status` columns and composite indexes on `(user_id, status)`

#### 3. pg_timezone_names Query
- **Calls**: 103
- **Mean Time**: 317ms
- **Cache Hit Rate**: 0% ⚠️
- **Status**: ⚠️ **Supabase Internal** - This is a Supabase system query. The 0% cache hit rate suggests it's being called too frequently. This may be a Supabase configuration issue.

#### 4. Realtime Subscription Creation
- **Calls**: 14,584
- **Mean Time**: 16.85ms
- **Status**: ✅ **Normal** - This is expected for real-time subscriptions. The occasional high max_time (8.9s) may indicate connection issues.

### Applied Optimizations

#### Indexes Added

1. **weekly_logs**:
   - `weekly_logs_status_idx` - For status filtering
   - `weekly_logs_user_status_idx` - For user + status queries
   - `weekly_logs_submitted_at_idx` - For sorting by submission date

2. **declarations**:
   - `declarations_status_idx` - For status filtering
   - `declarations_user_status_idx` - For user + status queries
   - `declarations_submitted_at_idx` - For sorting by submission date

3. **leave_requests**:
   - `leave_requests_status_idx` - For status filtering
   - `leave_requests_user_status_idx` - For user + status queries
   - `leave_requests_submitted_at_idx` - For sorting by submission date

### Expected Performance Improvements

- **Status filter queries**: Should see 50-90% improvement in query time
- **Composite queries** (user_id + status): Should see 70-95% improvement
- **Sorting queries**: Should see 30-60% improvement

### Recommendations

1. ✅ **Completed**: Added indexes for status filters
2. ⚠️ **Monitor**: Realtime query performance (normal but high volume)
3. ⚠️ **Investigate**: `pg_timezone_names` cache hit rate (Supabase internal)
4. 💡 **Consider**: Connection pooling if realtime subscription creation becomes a bottleneck
5. 💡 **Consider**: Pagination for large result sets if not already implemented

### Query Patterns to Monitor

- Queries filtering by `status` on `weekly_logs`, `declarations`, `leave_requests` - **Optimized**
- Realtime subscription queries - **Normal, but monitor volume**
- Profile lookups - **Fast (1.58ms mean)**
- Timezone queries - **Needs investigation**

### Notes

- Most slow queries are Supabase internal (realtime, auth, system queries)
- Application queries are generally fast (< 5ms mean time)
- The high percentage of time spent on realtime queries is expected for real-time applications
- All critical application queries now have appropriate indexes

