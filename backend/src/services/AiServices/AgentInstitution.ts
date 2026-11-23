import AppError from "../../errors/AppError";

// Older clients may omit the field; new creation flows pass the user's explicit choice.
export const resolveAgentInstitutionId = async (
  requested: unknown,
  defaultId: number | null,
  findActive: (id: number) => Promise<{ id: number } | null>
): Promise<number> => {
  const id = requested === undefined || requested === "" ? Number(defaultId) : Number(requested);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("ERR_INSTITUTION_NOT_FOUND", 404);
  const institution = await findActive(id);
  if (!institution) throw new AppError("ERR_INSTITUTION_NOT_FOUND", 404);
  return institution.id;
};
