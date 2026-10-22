-- Git auto-deploy: waiting commits disappear with their link. Project delete already cascades (FK);
-- these triggers cover unlinking (connection row deleted or no longer 'active'). Local only until GO — PUBLISH.
CREATE TRIGGER git_pending_on_unlink AFTER DELETE ON project_connections
BEGIN
  DELETE FROM git_pending_builds WHERE project_id = OLD.project_id;
END;
CREATE TRIGGER git_pending_on_deactivate AFTER UPDATE OF status ON project_connections
WHEN NEW.status <> 'active'
BEGIN
  DELETE FROM git_pending_builds WHERE project_id = NEW.project_id;
END;

UPDATE schema_meta SET value = '21', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
