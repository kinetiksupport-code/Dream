export function validateEvaluations(evaluations, questionIds) {
  if (!Array.isArray(evaluations) || evaluations.length !== questionIds.length)
    throw new Error("incomplete_grading");
  const ids = new Set();
  for (const evaluation of evaluations) {
    if (
      !evaluation ||
      !questionIds.includes(evaluation.question_id) ||
      ids.has(evaluation.question_id) ||
      typeof evaluation.is_correct !== "boolean" ||
      typeof evaluation.feedback !== "string"
    )
      throw new Error("invalid_grading");
    ids.add(evaluation.question_id);
  }
  return evaluations;
}
