import { formatMoney } from "~/lib/formatters";

export function SimpleTable({
	columns,
	rows,
}: {
	columns: { key: string; label: string; money?: boolean }[];
	rows: Record<string, unknown>[];
}) {
	if (rows.length === 0)
		return (
			<p className="mt-4 text-slate-500 text-sm">Sem linhas para exibir.</p>
		);
	return (
		<div className="mt-4 overflow-x-auto">
			<table className="w-full text-left text-sm">
				<thead className="text-slate-400">
					<tr>
						{columns.map((column) => (
							<th
								className="border-slate-800 border-b py-2 pr-4"
								key={column.key}
							>
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr className="border-slate-800 border-b" key={JSON.stringify(row)}>
							{columns.map((column) => (
								<td className="py-2 pr-4" key={column.key}>
									{column.money
										? formatMoney(Number(row[column.key] ?? 0))
										: String(row[column.key] ?? "")}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
