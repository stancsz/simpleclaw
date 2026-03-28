import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { executeSwarmManifest } from "@/../../src/core/dispatcher";

export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get("sessionId");

        if (!sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const db = getDbClient();
        const session = db.getSession(sessionId);

        if (!session || !session.manifest) {
            return Response.json({ error: "Session or manifest not found" }, { status: 404 });
        }

        const userId = session.user_id;
        const gasBalance = db.getGasBalance(userId);

        if (gasBalance <= 0) {
            db.writeAuditLog(sessionId, 'continuous_mode_suspended', { reason: 'insufficient_gas' });
            return Response.json({ error: "Insufficient gas. Continuous mode suspended." }, { status: 402 });
        }

        // Calculate next trigger (30 mins from now)
        const nextTriggerDate = new Date(Date.now() + 30 * 60 * 1000);
        const nextTriggerStr = nextTriggerDate.toISOString().replace('T', ' ').replace('Z', '');

        // Update heartbeat queue
        db.upsertHeartbeat(sessionId, nextTriggerStr, 'pending');
        db.writeAuditLog(sessionId, 'heartbeat_triggered', { next_trigger: nextTriggerStr });

        // Prevent double execution (idempotency check using heartbeat status updating)
        // Check transaction log in case duplicate webhook firing
        const idempotencyKey = `heartbeat-${sessionId}-${nextTriggerStr}`;
        if (db.checkIdempotency(idempotencyKey)) {
            return Response.json({ status: "success", message: "Idempotent request, already executed" }, { status: 200 });
        }
        db.createTransactionLogEntry(idempotencyKey, 'started', {});

        // Execute asynchronously
        executeSwarmManifest(session.manifest, sessionId, db)
            .then(async (results) => {
                const hasErrors = Object.values(results).some(res => res.status === "error");
                if (!hasErrors) {
                    const logs = db.getAuditLogs(sessionId);
                    const runId = `gas_consumed_for_heartbeat_${Date.now()}`;
                    await db.debitCredits(userId, 1);
                    db.writeAuditLog(sessionId, runId, { amount: 1 });
                }
                db.logTransaction(idempotencyKey, 'completed', results);
            })
            .catch((err) => {
                console.error('Error in asynchronous heartbeat executeSwarmManifest:', err);
                db.updateSessionStatus(sessionId, 'error');
                db.writeAuditLog(sessionId, 'heartbeat_execution_failed', { error: err.message || String(err) });
                db.logTransaction(idempotencyKey, 'failed', { error: err.message || String(err) });
            });

        return Response.json({ status: "success", message: "Heartbeat triggered execution" }, { status: 200 });

    } catch (error) {
        console.error("Error in heartbeat route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
