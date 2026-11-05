import { Stage } from "@prisma/client";
import type { Admin, DomainType } from "@prisma/client";
import { prisma } from "./prisma";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Move candidates between SHORTLISTED/SLOT_CHOOSING and INTERVIEW automatically.
export const ALLOWED_STAGE_MOVES: Record<Stage, Stage[]> = {
  FORM_FILLING: [Stage.SHORTLISTED, Stage.REJECTED],
  SHORTLISTED: [Stage.SLOT_CHOOSING, Stage.REJECTED],
  SLOT_CHOOSING: [Stage.REJECTED],
  INTERVIEW: [Stage.SELECTED, Stage.REJECTED, Stage.SLOT_CHOOSING],
  SELECTED: [],
  REJECTED: [],
};

export const MAX_REVIEW2_MARKS = 10;

export const DIVISION_LABELS: Record<DomainType, string> = {
  TECHNICAL: "Tech",
  MANAGEMENT: "Management",
  DESIGN: "Design",
  MARKETING: "Marketing",
  R_AND_D: "Research & Development",
  EDITORIAL: "Editorial",
};

// Root admins can act on any domain; heads only on their own
export function assertDomainAccess(admin: Admin, domain: DomainType) {
  if (admin.role === "ROOT_ADMIN") return;
  if (admin.domain !== domain) {
    throw new HttpError(403, "You can only manage your own domain", "WRONG_DOMAIN");
  }
}

// enforces the rules and frees the slot when a candidate is rejected or sent back to slot choosing. 
export async function changeStage(applicationId: string, to: Stage, admin: Admin) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { booking: true },
  });
  if (!app) throw new HttpError(404, "Application not found", "APPLICATION_NOT_FOUND");
  assertDomainAccess(admin, app.domain);

  // Direct move from FORM_FILLING to SHORTLISTED or REJECTED is blocked: must use decision and email flow
  if (app.stage === Stage.FORM_FILLING && (to === Stage.SHORTLISTED || to === Stage.REJECTED)) {
    throw new HttpError(409, "Stage changes from FORM_FILLING must go through the decision and email workflow", "USE_DECISION_FLOW");
  }

  if (!ALLOWED_STAGE_MOVES[app.stage].includes(to)) {
    throw new HttpError(409, `Can't move from ${app.stage} to ${to}`, "INVALID_STAGE_CHANGE");
  }
  if (app.stage === "FORM_FILLING" && to === "SHORTLISTED" && !app.submittedAt) {
    throw new HttpError(409, "The candidate hasn't submitted the form", "NOT_SUBMITTED");
  }

  const freeSlot = app.booking && (to === "REJECTED" || to === "SLOT_CHOOSING");

  return prisma.$transaction(async (tx) => {
    if (freeSlot && app.booking) {
      await tx.slotBooking.delete({ where: { id: app.booking.id } });
      await tx.slot.updateMany({
        where: { id: app.booking.slotId, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 } },
      });
    }
    return tx.application.update({ where: { id: app.id }, data: { stage: to } });
  });
}

// Call before deleting or editing a slot's time
export async function assertSlotHasNoBookings(slotId: string) {
  const count = await prisma.slotBooking.count({ where: { slotId } });
  if (count > 0) {
    throw new HttpError(
      409,
      "This slot has bookings. Move or cancel them first.",
      "SLOT_HAS_BOOKINGS"
    );
  }
}
