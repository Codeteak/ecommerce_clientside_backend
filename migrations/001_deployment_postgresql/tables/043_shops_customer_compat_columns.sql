-- Shop availability is `status` only (`active` | `blocked` | `deleted`).
-- Drop leftover boolean flags if they were added on a shared admin DB.

ALTER TABLE shops DROP COLUMN IF EXISTS is_active;
ALTER TABLE shops DROP COLUMN IF EXISTS is_blocked;
ALTER TABLE shops DROP COLUMN IF EXISTS is_deleted;

CREATE OR REPLACE FUNCTION app.lookup_shop_staff_by_login_code(p_code integer)
RETURNS TABLE (
  user_id uuid,
  shop_id uuid,
  role text,
  email text,
  phone text,
  password_hash text,
  staff_login_code integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.user_id, s.shop_id, s.role, u.email, u.phone, u.password_hash, u.staff_login_code
  FROM shop_staff s
  JOIN users u ON u.id = s.user_id
  JOIN shops sh ON sh.id = s.shop_id
    AND sh.status = 'active'
  WHERE s.status = 'active'
    AND u.is_active = true
    AND u.staff_login_code = p_code
    AND s.role <> 'picker';
$$;
