const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function simulateBooking() {
  console.log("🔍 Searching for a candidate waiting to book a slot...");
  
  // 1. Find the first candidate in SLOT_CHOOSING
  const app = await prisma.application.findFirst({
    where: { stage: 'SLOT_CHOOSING' },
    include: { user: true }
  });

  if (!app) {
    console.log("❌ No candidate found in SLOT_CHOOSING stage. (Make sure you clicked 'Release Shortlist' in Tab 2!)");
    return;
  }

  // 2. Find an available slot in their domain
  const slot = await prisma.slot.findFirst({
    where: { domain: app.domain }
  });

  if (!slot) {
    console.log(`❌ No slots found for domain ${app.domain}. Please create one in Tab 4.`);
    return;
  }

  console.log(`Found slot on ${new Date(slot.startTime).toLocaleString()}`);
  console.log(`Booking candidate: ${app.user.name} (${app.user.email})...`);

  // 3. Simulate the candidate backend workflow: Create booking, update count, move to INTERVIEW
  await prisma.$transaction([
    prisma.slotBooking.create({
      data: {
        applicationId: app.id,
        slotId: slot.id
      }
    }),
    prisma.slot.update({
      where: { id: slot.id },
      data: { bookedCount: { increment: 1 } }
    }),
    prisma.application.update({
      where: { id: app.id },
      data: { stage: 'INTERVIEW' }
    })
  ]);

  console.log("SUCCESS! The candidate has officially 'booked' the slot.");
  console.log("Go refresh your Admin Portal!");
}

simulateBooking()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());