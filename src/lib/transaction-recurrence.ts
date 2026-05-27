export type TransactionRecurrenceLink = {
	recurrenceId: number | null;
	recurrenceOccurrenceOn: string | null;
};

export type ExistingTransactionRecurrence = TransactionRecurrenceLink & {
	movementType: string;
};

export function recurrenceLinkForTransactionUpdate({
	formHasRecurrenceFields,
	existing,
	nextMovementType,
	parsedLink,
}: {
	formHasRecurrenceFields: boolean;
	existing: ExistingTransactionRecurrence;
	nextMovementType: string;
	parsedLink: TransactionRecurrenceLink;
}): TransactionRecurrenceLink {
	if (formHasRecurrenceFields) return parsedLink;
	if (existing.movementType !== nextMovementType) return parsedLink;
	if (!existing.recurrenceId || !existing.recurrenceOccurrenceOn)
		return parsedLink;

	return {
		recurrenceId: existing.recurrenceId,
		recurrenceOccurrenceOn: existing.recurrenceOccurrenceOn,
	};
}
