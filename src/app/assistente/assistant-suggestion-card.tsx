"use client";

import { useState } from "react";

import {
	acceptAssistantSuggestion,
	rejectAssistantSuggestion,
} from "~/app/_actions/assistant-actions";
import { SubmitButton } from "~/components/submit-button";
import { Card, CardContent } from "~/components/ui/card";

export function AssistantSuggestionCard({
	children,
	suggestionId,
}: {
	children: React.ReactNode;
	suggestionId: number;
}) {
	const [isVisible, setIsVisible] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	async function acceptWithRollback(formData: FormData) {
		setError(null);
		setStatus("Aceitando sugestão...");
		setIsVisible(false);
		try {
			await acceptAssistantSuggestion(formData);
			setStatus("Sugestão aceita.");
		} catch {
			setIsVisible(true);
			setError("Não foi possível aceitar a sugestão.");
			setStatus(null);
		}
	}

	async function rejectWithRollback(formData: FormData) {
		setError(null);
		setStatus("Rejeitando sugestão...");
		setIsVisible(false);
		try {
			await rejectAssistantSuggestion(formData);
			setStatus("Sugestão rejeitada.");
		} catch {
			setIsVisible(true);
			setError("Não foi possível rejeitar a sugestão.");
			setStatus(null);
		}
	}

	return (
		<>
			<p aria-live="polite" className="sr-only" role="status">
				{status ?? ""}
			</p>
			{error ? (
				<p
					aria-live="polite"
					className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
			{isVisible ? (
				<Card>
					<CardContent className="pt-6">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
							<div className="space-y-2">{children}</div>
							<div className="flex shrink-0 items-center gap-2">
								<form action={acceptWithRollback}>
									<input name="id" type="hidden" value={suggestionId} />
									<SubmitButton pendingLabel="Aceitando..." size="sm">
										Aceitar
									</SubmitButton>
								</form>
								<form action={rejectWithRollback}>
									<input name="id" type="hidden" value={suggestionId} />
									<SubmitButton
										pendingLabel="Rejeitando..."
										size="sm"
										variant="secondary"
									>
										Rejeitar
									</SubmitButton>
								</form>
							</div>
						</div>
					</CardContent>
				</Card>
			) : null}
		</>
	);
}
