// ستون‌های مجاز هر جدول — سفیدلیست برای جلوگیری از تزریق از طریق نام ستون
export const TABLES = {
  workspaces: ['id', 'name', 'license_expires_at', 'trial_ends_at', 'created_at'],
  users: ['id', 'workspace_id', 'name', 'email', 'phone', 'password_hash', 'role',
    'totp_secret', 'totp_enabled', 'failed_attempts', 'locked_until', 'suspended',
    'must_change_password', 'created_at', 'updated_at'],
  refresh_tokens: ['id', 'user_id', 'family_id', 'token_hash', 'user_agent',
    'expires_at', 'revoked_at', 'last_used_at', 'created_at'],
  password_resets: ['id', 'user_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
  plans: ['id', 'code', 'name', 'duration_days', 'price_toman', 'sort_order'],
  licenses: ['id', 'workspace_id', 'plan_id', 'batch_id', 'code_hash', 'code_last4',
    'duration_days', 'status', 'redeemed_by', 'redeemed_at', 'expires_at', 'created_at'],
  tickets: ['id', 'workspace_id', 'subject', 'priority', 'status', 'created_by',
    'assigned_to', 'created_at', 'updated_at'],
  ticket_messages: ['id', 'ticket_id', 'author_id', 'body', 'created_at'],
  audit_logs: ['id', 'workspace_id', 'user_id', 'event', 'ip', 'meta', 'created_at'],
  invoices: ['id', 'workspace_id', 'number', 'status', 'total', 'doc_date',
    'payload', 'deleted_at', 'created_at', 'updated_at'],
  contacts: ['id', 'workspace_id', 'name', 'payload', 'updated_at'],
  products: ['id', 'workspace_id', 'title', 'payload', 'updated_at'],
};

export const JSON_COLUMNS = new Set(['meta', 'payload']);
export const ID_COLUMN = 'id';
