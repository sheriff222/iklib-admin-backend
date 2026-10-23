// src/utils/audit.js — append-only audit log for privileged actions.
// Known actions: paper.publish, paper.save_draft, verification.approve, verification.reject, admin.create
const prisma = require('../prisma');

async function logAudit({ actorId, actorRole, action, targetType, targetId = null, meta = null }, tx = prisma) {
  try {
    await tx.auditLog.create({
      data: { actorId, actorRole, action, targetType, targetId, meta },
    });
  } catch (e) {
    // Audit logging must never break the main flow.
    console.warn('[audit] failed to write:', e.message);
  }
}

module.exports = { logAudit };
