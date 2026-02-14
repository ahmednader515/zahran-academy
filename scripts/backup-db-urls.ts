import "dotenv/config";
import { db } from "../lib/db";
import * as fs from "fs";
import * as path from "path";

interface BackupData {
  users: Array<{ id: string; image: string | null }>;
  courses: Array<{ id: string; imageUrl: string | null }>;
  attachments: Array<{ id: string; url: string }>;
  chapters: Array<{ id: string; videoUrl: string | null; documentUrl: string | null }>;
  chapterAttachments: Array<{ id: string; url: string }>;
  questions: Array<{ id: string; imageUrl: string | null }>;
  timestamp: string;
}

async function backupDatabaseUrls() {
  try {
    console.log("📦 Starting database URL backup...");

    const backupData: BackupData = {
      users: [],
      courses: [],
      attachments: [],
      chapters: [],
      chapterAttachments: [],
      questions: [],
      timestamp: new Date().toISOString(),
    };

    // Backup User images
    const users = await db.user.findMany({
      select: { id: true, image: true },
      where: { image: { not: null } },
    });
    backupData.users = users.map((u) => ({ id: u.id, image: u.image }));

    // Backup Course images
    const courses = await db.course.findMany({
      select: { id: true, imageUrl: true },
      where: { imageUrl: { not: null } },
    });
    backupData.courses = courses.map((c) => ({ id: c.id, imageUrl: c.imageUrl }));

    // Backup Attachments
    const attachments = await db.attachment.findMany({
      select: { id: true, url: true },
    });
    backupData.attachments = attachments;

    // Backup Chapters
    const chapters = await db.chapter.findMany({
      select: { id: true, videoUrl: true, documentUrl: true },
      where: {
        OR: [
          { videoUrl: { not: null } },
          { documentUrl: { not: null } },
        ],
      },
    });
    backupData.chapters = chapters.map((c) => ({
      id: c.id,
      videoUrl: c.videoUrl,
      documentUrl: c.documentUrl,
    }));

    // Backup Chapter Attachments
    const chapterAttachments = await db.chapterAttachment.findMany({
      select: { id: true, url: true },
    });
    backupData.chapterAttachments = chapterAttachments;

    // Backup Question images
    const questions = await db.question.findMany({
      select: { id: true, imageUrl: true },
      where: { imageUrl: { not: null } },
    });
    backupData.questions = questions.map((q) => ({ id: q.id, imageUrl: q.imageUrl }));

    // Save to file
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `db-urls-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

    console.log(`✅ Backup saved to: ${backupFile}`);
    console.log(`📊 Statistics:`);
    console.log(`   - Users: ${backupData.users.length}`);
    console.log(`   - Courses: ${backupData.courses.length}`);
    console.log(`   - Attachments: ${backupData.attachments.length}`);
    console.log(`   - Chapters: ${backupData.chapters.length}`);
    console.log(`   - Chapter Attachments: ${backupData.chapterAttachments.length}`);
    console.log(`   - Questions: ${backupData.questions.length}`);
  } catch (error: any) {
    console.error("❌ Failed to backup database URLs:", error.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

backupDatabaseUrls();

