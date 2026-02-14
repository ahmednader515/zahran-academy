import "dotenv/config";
import { db } from "../lib/db";
import * as fs from "fs";
import * as path from "path";

interface FileMapping {
  originalUrl: string;
  r2Url: string;
  r2Key: string;
  fileName: string;
}

async function migrateDatabaseUrls() {
  try {
    console.log("🔄 Starting database URL migration...");

    // Load mapping file
    const mappingFile = path.join(process.cwd(), "uploadthing-to-r2-mapping.json");
    if (!fs.existsSync(mappingFile)) {
      console.error("❌ Mapping file not found. Run upload-to-r2.ts first.");
      process.exit(1);
    }

    const mapping: FileMapping[] = JSON.parse(
      fs.readFileSync(mappingFile, "utf-8")
    );

    console.log(`📋 Loaded ${mapping.length} URL mappings`);

    // Create URL lookup map
    const urlMap = new Map<string, string>();
    mapping.forEach((m) => {
      urlMap.set(m.originalUrl, m.r2Url);
    });

    let updatedCount = 0;

    // Migrate User images
    console.log("👤 Migrating user images...");
    const users = await db.user.findMany({
      where: { image: { not: null } },
    });
    for (const user of users) {
      if (user.image && urlMap.has(user.image)) {
        await db.user.update({
          where: { id: user.id },
          data: { image: urlMap.get(user.image)! },
        });
        updatedCount++;
        console.log(`  ✅ Updated user ${user.id}`);
      }
    }

    // Migrate Course images
    console.log("📚 Migrating course images...");
    const courses = await db.course.findMany({
      where: { imageUrl: { not: null } },
    });
    for (const course of courses) {
      if (course.imageUrl && urlMap.has(course.imageUrl)) {
        await db.course.update({
          where: { id: course.id },
          data: { imageUrl: urlMap.get(course.imageUrl)! },
        });
        updatedCount++;
        console.log(`  ✅ Updated course ${course.id}`);
      }
    }

    // Migrate Attachments
    console.log("📎 Migrating attachments...");
    const attachments = await db.attachment.findMany();
    for (const attachment of attachments) {
      if (urlMap.has(attachment.url)) {
        await db.attachment.update({
          where: { id: attachment.id },
          data: { url: urlMap.get(attachment.url)! },
        });
        updatedCount++;
        console.log(`  ✅ Updated attachment ${attachment.id}`);
      }
    }

    // Migrate Chapter videos and documents
    console.log("🎥 Migrating chapter videos and documents...");
    const chapters = await db.chapter.findMany({
      where: {
        OR: [{ videoUrl: { not: null } }, { documentUrl: { not: null } }],
      },
    });
    for (const chapter of chapters) {
      const updates: any = {};
      if (chapter.videoUrl && urlMap.has(chapter.videoUrl)) {
        updates.videoUrl = urlMap.get(chapter.videoUrl)!;
      }
      if (chapter.documentUrl && urlMap.has(chapter.documentUrl)) {
        updates.documentUrl = urlMap.get(chapter.documentUrl)!;
      }
      if (Object.keys(updates).length > 0) {
        await db.chapter.update({
          where: { id: chapter.id },
          data: updates,
        });
        updatedCount++;
        console.log(`  ✅ Updated chapter ${chapter.id}`);
      }
    }

    // Migrate Chapter Attachments
    console.log("📄 Migrating chapter attachments...");
    const chapterAttachments = await db.chapterAttachment.findMany();
    for (const attachment of chapterAttachments) {
      if (urlMap.has(attachment.url)) {
        await db.chapterAttachment.update({
          where: { id: attachment.id },
          data: { url: urlMap.get(attachment.url)! },
        });
        updatedCount++;
        console.log(`  ✅ Updated chapter attachment ${attachment.id}`);
      }
    }

    // Migrate Question images
    console.log("❓ Migrating question images...");
    const questions = await db.question.findMany({
      where: { imageUrl: { not: null } },
    });
    for (const question of questions) {
      if (question.imageUrl && urlMap.has(question.imageUrl)) {
        await db.question.update({
          where: { id: question.id },
          data: { imageUrl: urlMap.get(question.imageUrl)! },
        });
        updatedCount++;
        console.log(`  ✅ Updated question ${question.id}`);
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`📊 Updated ${updatedCount} records`);
  } catch (error: any) {
    console.error("❌ Failed to migrate database URLs:", error.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

migrateDatabaseUrls();

