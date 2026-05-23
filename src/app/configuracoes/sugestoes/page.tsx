import { and, desc, eq, gte, type SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "~/components/empty-state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { formatDateTime } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	assistantSuggestions,
	type assistantSuggestionKind as KindEnum,
	type assistantSuggestionStatus as StatusEnum,
} from "~/server/db/schema";

const kindLabels: Record<string, string> = {
	category_for_transaction: "Categoria sugerida",
	category_rule: "Regra de categorização",
	anomaly: "Anomalia",
	savings_opportunity: "Oportunidade de economia",
};

const statusLabels: Record<string, string> = {
	pending: "Pendente",
	accepted: "Aceita",
	rejected: "Rejeitada",
	superseded: "Substituída",
};

const kindOptions = [
	{ value: "", label: "Todos os tipos" },
	{ value: "category_for_transaction", label: "Categoria sugerida" },
	{ value: "category_rule", label: "Regra de categorização" },
	{ value: "anomaly", label: "Anomalia" },
	{ value: "savings_opportunity", label: "Oportunidade de economia" },
];

const statusOptions = [
	{ value: "", label: "Todos os status" },
	{ value: "pending", label: "Pendente" },
	{ value: "accepted", label: "Aceita" },
	{ value: "rejected", label: "Rejeitada" },
	{ value: "superseded", label: "Substituída" },
];

const periodOptions = [
	{ value: "", label: "Sem limite" },
	{ value: "30", label: "Últimos 30 dias" },
	{ value: "90", label: "Últimos 90 dias" },
	{ value: "365", label: "Últimos 12 meses" },
];

const pageSize = 100;

export default async function SugestoesPage({
	searchParams,
}: {
	searchParams?: Promise<{
		kind?: string;
		status?: string;
		period?: string;
	}>;
}) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;
	const params = (await searchParams) ?? {};
	const kindFilter = pickValue(params.kind, kindOptions);
	const statusFilter = pickValue(params.status, statusOptions);
	const periodFilter = pickValue(params.period, periodOptions);

	const filters: SQL[] = [eq(assistantSuggestions.userId, userId)];
	if (kindFilter) {
		filters.push(
			eq(
				assistantSuggestions.kind,
				kindFilter as (typeof KindEnum)["enumValues"][number],
			),
		);
	}
	if (statusFilter) {
		filters.push(
			eq(
				assistantSuggestions.status,
				statusFilter as (typeof StatusEnum)["enumValues"][number],
			),
		);
	}
	if (periodFilter) {
		const days = Number.parseInt(periodFilter, 10);
		const cutoff = new Date();
		cutoff.setUTCDate(cutoff.getUTCDate() - days);
		filters.push(gte(assistantSuggestions.createdAt, cutoff));
	}

	const suggestions = await db
		.select()
		.from(assistantSuggestions)
		.where(and(...filters))
		.orderBy(desc(assistantSuggestions.createdAt))
		.limit(pageSize);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sugestões da IA</CardTitle>
				<CardDescription>{`Últimas ${pageSize} sugestões com aceite, rejeição e contexto. As decisões registram quando ocorreram.`}</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					action="/configuracoes/sugestoes"
					className="mb-6 flex flex-wrap items-end gap-3"
				>
					<FilterSelect
						defaultValue={kindFilter ?? ""}
						label="Tipo"
						name="kind"
						options={kindOptions}
					/>
					<FilterSelect
						defaultValue={statusFilter ?? ""}
						label="Status"
						name="status"
						options={statusOptions}
					/>
					<FilterSelect
						defaultValue={periodFilter ?? ""}
						label="Período"
						name="period"
						options={periodOptions}
					/>
					<Button type="submit" variant="outline">
						Filtrar
					</Button>
					<Button asChild variant="ghost">
						<Link href="/configuracoes/sugestoes">Limpar</Link>
					</Button>
				</form>

				{suggestions.length === 0 ? (
					<EmptyState title="Nenhuma sugestão encontrada para os filtros aplicados." />
				) : (
					<ul className="flex flex-col gap-3">
						{suggestions.map((suggestion) => (
							<li
								className="rounded-md border bg-muted/20 p-4"
								key={suggestion.id}
							>
								<div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
									<span className="flex flex-wrap items-center gap-2">
										{kindLabels[suggestion.kind] ?? suggestion.kind}
										<Badge variant={statusVariant(suggestion.status)}>
											{statusLabels[suggestion.status] ?? suggestion.status}
										</Badge>
									</span>
									<span>
										Criada {formatDateTime(suggestion.createdAt)}
										{suggestion.decidedAt
											? ` · decidida ${formatDateTime(suggestion.decidedAt)}`
											: ""}
									</span>
								</div>
								<p className="mt-2 text-sm">{suggestion.reason}</p>
								<details className="mt-2">
									<summary className="cursor-pointer text-primary text-xs">
										Ver payload
									</summary>
									<pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
										{JSON.stringify(suggestion.payload, null, 2)}
									</pre>
								</details>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function FilterSelect({
	label,
	name,
	options,
	defaultValue,
}: {
	label: string;
	name: string;
	options: { value: string; label: string }[];
	defaultValue: string;
}) {
	return (
		<div className="grid gap-1">
			<Label className="text-xs" htmlFor={name}>
				{label}
			</Label>
			<select
				className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
				defaultValue={defaultValue}
				id={name}
				name={name}
			>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}

function statusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "accepted":
			return "default";
		case "rejected":
			return "destructive";
		case "superseded":
			return "secondary";
		default:
			return "outline";
	}
}

function pickValue(value: string | undefined, options: { value: string }[]) {
	if (!value) return null;
	const allowed = options.map((opt) => opt.value).filter(Boolean);
	return allowed.includes(value) ? value : null;
}
