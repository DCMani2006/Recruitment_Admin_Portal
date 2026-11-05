import { Stage, PrismaClient } from "@prisma/client";
import type { Admin, DomainType } from "@prisma/client";

const prisma = new PrismaClient();

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Stage moves an admin may make. SLOT_CHOOSING -> INTERVIEW is never an admin move: the
// student backend does it when the candidate books a slot.
// SELECTED <-> REJECTED lets the Review 2 toggle be flipped back; REJECTED -> SLOT_CHOOSING undoes a
// Review 1 rejection. changeStage adds the conditions (interviewed or not) for leaving REJECTED.
export const ALLOWED_STAGE_MOVES: Record<Stage, Stage[]> = {
  FORM_FILLING: [Stage.SHORTLISTED, Stage.SLOT_CHOOSING, Stage.REJECTED],
  SHORTLISTED: [Stage.SLOT_CHOOSING, Stage.REJECTED],
  SLOT_CHOOSING: [Stage.REJECTED],
  INTERVIEW: [Stage.SELECTED, Stage.REJECTED, Stage.SLOT_CHOOSING],
  SELECTED: [Stage.REJECTED],
  REJECTED: [Stage.SELECTED, Stage.SLOT_CHOOSING],
};

// Root admins can act on any domain; heads only on their own
export function assertDomainAccess(admin: Admin, domain: DomainType) {
  if (admin.role === "ROOT_ADMIN") return;
  if (admin.domain !== domain) {
    throw new HttpError(403, "You can only manage your own domain", "WRONG_DOMAIN");
  }
}

// Enforces the rules above and frees the candidate's slot when they're sent back to slot choosing,
// or rejected before their interview time (so someone else can book it). A booking whose interview
// has already happened is kept as the record: the Review 2 list is built from bookings.
export async function changeStage(applicationId: string, to: Stage, admin: Admin) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { booking: { include: { slot: true } } },
  });
  if (!app) throw new HttpError(404, "Application not found", "APPLICATION_NOT_FOUND");
  assertDomainAccess(admin, app.domain);

  if (!ALLOWED_STAGE_MOVES[app.stage].includes(to)) {
    throw new HttpError(409, `Can't move from ${app.stage} to ${to}`, "INVALID_STAGE_CHANGE");
  }
  if (app.stage === "FORM_FILLING" && !app.submittedAt && to !== "REJECTED") {
    throw new HttpError(409, "The candidate hasn't submitted the form", "NOT_SUBMITTED");
  }

  const interviewDone = !!app.booking && app.booking.slot.startTime <= new Date();
  const interviewed = interviewDone || app.review2Marks !== null;
  if (app.stage === "REJECTED" && to === "SELECTED" && !interviewed) {
    throw new HttpError(409, "Only a candidate who was interviewed can be selected", "NOT_INTERVIEWED");
  }
  if (app.stage === "REJECTED" && to === "SLOT_CHOOSING" && interviewed) {
    throw new HttpError(409, "This candidate was already interviewed", "ALREADY_INTERVIEWED");
  }

  const freeSlot = app.booking && (to === "SLOT_CHOOSING" || (to === "REJECTED" && !interviewDone));

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