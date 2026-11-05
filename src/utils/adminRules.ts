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

// Stage moves an admin may make. Flexible transitions allowed for domain heads / root admins.
export const ALLOWED_STAGE_MOVES: Record<Stage, Stage[]> = {
  FORM_FILLING: [Stage.SHORTLISTED, Stage.SLOT_CHOOSING, Stage.INTERVIEW, Stage.SELECTED, Stage.REJECTED],
  SHORTLISTED: [Stage.FORM_FILLING, Stage.SLOT_CHOOSING, Stage.INTERVIEW, Stage.SELECTED, Stage.REJECTED],
  SLOT_CHOOSING: [Stage.FORM_FILLING, Stage.SHORTLISTED, Stage.INTERVIEW, Stage.SELECTED, Stage.REJECTED],
  INTERVIEW: [Stage.FORM_FILLING, Stage.SHORTLISTED, Stage.SLOT_CHOOSING, Stage.SELECTED, Stage.REJECTED],
  SELECTED: [Stage.FORM_FILLING, Stage.SHORTLISTED, Stage.SLOT_CHOOSING, Stage.INTERVIEW, Stage.REJECTED],
  REJECTED: [Stage.FORM_FILLING, Stage.SHORTLISTED, Stage.SLOT_CHOOSING, Stage.INTERVIEW, Stage.SELECTED],
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

// Enforces domain access and frees the slot when a candidate is moved away from interview/booking.
export async function changeStage(applicationId: string, to: Stage, admin: Admin) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { booking: true },
  });
  if (!app) throw new HttpError(404, "Application not found", "APPLICATION_NOT_FOUND");
  assertDomainAccess(admin, app.domain);

  if (app.stage === to) {
    return app;
  }

  // Free the booking if moving to REJECTED, FORM_FILLING, or SLOT_CHOOSING
  const freeSlot = app.booking && (to === "REJECTED" || to === "FORM_FILLING" || to === "SLOT_CHOOSING");

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
