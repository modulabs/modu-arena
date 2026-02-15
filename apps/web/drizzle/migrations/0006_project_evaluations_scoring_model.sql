ALTER TABLE project_evaluations
  ADD COLUMN IF NOT EXISTS local_score INTEGER,
  ADD COLUMN IF NOT EXISTS backend_score INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_score INTEGER,
  ADD COLUMN IF NOT EXISTS final_score INTEGER,
  ADD COLUMN IF NOT EXISTS cumulative_score_after INTEGER;

UPDATE project_evaluations
SET
  local_score = COALESCE(local_score, rubric_functionality, 0),
  backend_score = COALESCE(backend_score, rubric_practicality, 0),
  penalty_score = COALESCE(penalty_score, 0),
  final_score = COALESCE(final_score, total_score, 0),
  cumulative_score_after = COALESCE(cumulative_score_after, total_score, 0)
WHERE local_score IS NULL
   OR backend_score IS NULL
   OR penalty_score IS NULL
   OR final_score IS NULL
   OR cumulative_score_after IS NULL;

ALTER TABLE project_evaluations
  ALTER COLUMN local_score SET NOT NULL,
  ALTER COLUMN backend_score SET NOT NULL,
  ALTER COLUMN penalty_score SET NOT NULL,
  ALTER COLUMN final_score SET NOT NULL,
  ALTER COLUMN cumulative_score_after SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_evaluations_user_project_hash_uniq
  ON project_evaluations(user_id, project_path_hash);
