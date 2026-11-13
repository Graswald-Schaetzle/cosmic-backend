/**
 * True when the user owns the space or is a member of it, false when not, null when the space
 * does not exist.
 */
async function hasSpaceAccess(supabase, spaceId, userId) {
  const { data: space } = await supabase
    .from('spaces')
    .select('space_id, owner_user_id')
    .eq('space_id', spaceId)
    .maybeSingle();
  if (!space) return null;
  if (space.owner_user_id === userId) return true;
  const { data: membership } = await supabase
    .from('space_memberships')
    .select('id')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(membership);
}

/**
 * Checks access to a space and answers the request itself when there is none.
 * Returns true when the handler may go on.
 */
async function requireSpaceAccess(supabase, spaceId, req, res) {
  const access = await hasSpaceAccess(supabase, spaceId, req.user_id);
  if (access === null) {
    res.status(404).json({ error: 'Space not found' });
    return false;
  }
  if (!access) {
    res.status(403).json({ error: 'No access to this space' });
    return false;
  }
  return true;
}

module.exports = { hasSpaceAccess, requireSpaceAccess };
