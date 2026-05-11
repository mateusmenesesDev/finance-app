"use client";

import { useRef } from "react";

import { quickCategorizeTransaction } from "~/app/_actions/finance-actions";

const inputClass =
	"rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]";

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
			<p className="mt-3 text-[color:var(--color-text-subtle)] text-sm">
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
			<button
				aria-keyshortcuts="Control+Enter"
				className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm"
				title="Atalho neste controle: Ctrl+Enter"
				type="submit"
			>
				Categorizar
			</button>
			<span
				className="text-[color:var(--color-text-subtle)] text-xs"
				id={hintId}
			>
				Atalho com foco neste controle: Ctrl+Enter.
			</span>
		</form>
	);
}
