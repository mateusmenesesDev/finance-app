import { NextResponse } from "next/server";

import { recordAudit } from "~/server/audit";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { exportUserFinancialData } from "~/server/user-data";

// Exporta o JSON com todos os dados financeiros do usuário autenticado.
// Reflete o estado atual do banco (já mascarado pela política de Fase 12).
export async function GET() {
	const session = await getSession();
	if (!session?.user.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}
	const userId = session.user.id;
	const data = await exportUserFinancialData(userId);
	await recordAudit(db, {
		userId,
		entityType: "user_data",
		entityId: null,
		action: "updated",
		summary: "Exportação de dados financeiros",
	});
	const filename = `finance-app-export-${userId}-${formatDateForFilename(
		new Date(),
	)}.json`;
	return new NextResponse(JSON.stringify(data, null, 2), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"content-disposition": `attachment; filename="${filename}"`,
		},
	});
}

function formatDateForFilename(date: Date) {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const min = String(date.getUTCMinutes()).padStart(2, "0");
	return `${yyyy}${mm}${dd}-${hh}${min}`;
}
