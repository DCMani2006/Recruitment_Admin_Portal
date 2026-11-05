import "dotenv/config";
import { prisma } from "../src/utils/prisma";

async function main() {
  const [
    adminCount,
    userCount,
    appCount,
    questionCount,
    subsectionCount,
    slotCount,
    bookingCount,
    emailLogCount,
  ] = await Promise.all([
    prisma.admin.count(),
    prisma.user.count(),
    prisma.application.count(),
    prisma.question.count(),
    prisma.subsection.count(),
    prisma.slot.count(),
    prisma.slotBooking.count(),
    prisma.emailLog.count(),
  ]);

  console.log("DB COUNTS SUMMARY:");
  console.log(`- Admins: ${adminCount}`);
  console.log(`- Users: ${userCount}`);
  console.log(`- Applications: ${appCount}`);
  console.log(`- Questions: ${questionCount}`);
  console.log(`- Subsections: ${subsectionCount}`);
  console.log(`- Slots: ${slotCount}`);
  console.log(`- Bookings: ${bookingCount}`);
  console.log(`- EmailLogs: ${emailLogCount}`);
}

main()
  .catch((err) => {
    console.error("Error querying counts:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
