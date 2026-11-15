-- Which ingredient lines a step uses, so cook mode can list them beside the step.
-- quantity and unit are set only when the step uses part of the line (4 of the 6 garlic cloves).
CREATE TABLE step_ingredients (
  step_id uuid NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
  ingredient_line_id uuid NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
  quantity numeric,
  unit text,
  PRIMARY KEY (step_id, ingredient_line_id)
);
CREATE INDEX step_ingredients_line ON step_ingredients (ingredient_line_id);
