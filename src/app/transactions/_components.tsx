"use client";

import { useRef } from "react";

import { quickCategorizeTransaction } from "~/app/_actions/finance-actions";
import { SubmitButton } from "~/components/submit-button";

const inputClass =
	"h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type QuickCategory = {
	id: number;
	name: string;
};

export function QuickCategorizeForm({
	categories,
	currentCategoryId,
	transactionDescription,
	transactionId,
}: {
	categories: QuickCategory[];
	currentCategoryId: number | null;
	transactionDescription: string;
	transactionId: number;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const hintId = `quick-categorize-hint-${transactionId}`;

	if (categories.length === 0) {
		return (
			<p className="mt-3 text-muted-foreground text-sm">
				Crie uma categoria compatível antes de categorizar rapidamente.
			</p>
		);
	}

	return (
		<form
			action={quickCategorizeTransaction}
			aria-describedby={hintId}
			className="mt-3 flex flex-wrap items-center gap-2"
			onKeyDown={(event) => {
				if (event.ctrlKey && event.key === "Enter") {
					event.preventDefault();
					formRef.current?.requestSubmit();
				}
			}}
			ref={formRef}
		>
			<input name="id" type="hidden" value={transactionId} />
			<label className="sr-only" htmlFor={`quick-category-${transactionId}`}>
				Categoria rápida para {transactionDescription}
			</label>
			<select
				className={inputClass}
				defaultValue={currentCategoryId ?? categories[0]?.id}
				id={`quick-category-${transactionId}`}
				name="categoryId"
			>
				{categories.map((category) => (
					<option key={category.id} value={category.id}>
						{category.name}
					</option>
				))}
			</select>
			<SubmitButton
				aria-keyshortcuts="Control+Enter"
				className="px-3"
				pendingLabel="Categorizando..."
				title="Atalho neste controle: Ctrl+Enter"
				variant="secondary"
			>
				Categorizar
			</SubmitButton>
			<span className="text-muted-foreground text-xs" id={hintId}>
				Atalho com foco neste controle: Ctrl+Enter.
			</span>
		</form>
	);
}
