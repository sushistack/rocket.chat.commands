export interface PaginatedResponse<T> {
    next_cursor: string;
    prev_cursor: string;
    next_page_results: boolean;
    prev_page_results: boolean;
    total_pages: number;
    extra_stats: any;
    count: number;
    total_count: number;
    results: T[];
}

export interface PlaneProject {
    id: string;
    name: string;
    identifier: string;
    description: string;
    network: number;
    created_at: string;
    updated_at: string;
}

export interface PlaneState {
    id: string;
    name: string;
    color: string;
    group: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
    sequence: number;
    is_default: boolean;
    project: string;
}

export interface PlaneLabel {
    id: string;
    name: string;
    color: string;
    project: string;
}

export interface PlaneIssue {
    id: string;
    name: string;
    description_html: string;
    priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    state: string; // state ID
    assignees: string[];
    labels: string[];
    start_date: string | null;
    target_date: string | null; // due_date
    point: number | null;
    sequence_id: number;
    project: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    state_detail?: PlaneState;
}

export interface PlaneCycle {
    id: string;
    name: string;
    description: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
    project: string;
    total_issues: number;
    completed_issues: number;
    cancelled_issues: number;
    started_issues: number;
    unstarted_issues: number;
    backlog_issues: number;
}

export interface PlaneComment {
    id: string;
    comment_html: string;
    actor_detail: { first_name: string; last_name: string };
    created_at: string;
    updated_at: string;
}

export interface PulsarMeta {
    quest_date?: string;
    scheduled_time?: string;
    adjusted_duration_min?: number;
    generation_source?: 'routine_copy' | 'llm_generated' | 'user_created' | 'deferred_restored';
    defer_count?: number;
    original_quest_date?: string;
    source_project_id?: string;
    source_issue_id?: string;
    // Routine template fields
    routine_type?: 'daily' | 'weekly' | 'custom';
    routine_days?: string[];
    routine_time?: string;
    routine_duration_min?: number;
    routine_priority?: string;
    routine_mandatory?: boolean;
    routine_active_from?: string;
    routine_active_until?: string;
    routine_cooldown_days?: number;
}
