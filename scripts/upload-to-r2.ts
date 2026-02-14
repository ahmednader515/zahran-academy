import "dotenv/config";
import { uploadToR2, generateR2Key, getFolderForFileType } from "../lib/r2/upload";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

interface FileMapping {
  originalUrl: string;
  r2Url: string;
  r2Key: string;
  fileName: string;
}

/**
 * Download a file from URL
 */
function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(outputPath);

    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirects
          return downloadFile(response.headers.location!, outputPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlinkSync(outputPath);
        reject(err);
      });
  });
}

/**
 * Extract filename from URL
 */
function getFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || "file";
    return decodeURIComponent(filename);
  } catch {
    return "file";
  }
}

async function uploadFilesToR2() {
  try {
    console.log("📤 Starting file upload to R2...");

    // Read URLs from backup file or provide a file with URLs
    const backupDir = path.join(process.cwd(), "backups");
    const backupFiles = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("db-urls-backup-") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (backupFiles.length === 0) {
      console.error("❌ No backup files found. Run backup-db-urls.ts first.");
      process.exit(1);
    }

    const latestBackup = path.join(backupDir, backupFiles[0]);
    const backupData = JSON.parse(fs.readFileSync(latestBackup, "utf-8"));

    const mapping: FileMapping[] = [];
    const tempDir = path.join(process.cwd(), "temp-downloads");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Collect all URLs
    const allUrls: Array<{ url: string; type: string }> = [];

    // Users
    backupData.users.forEach((u: any) => {
      if (u.image) allUrls.push({ url: u.image, type: "user" });
    });

    // Courses
    backupData.courses.forEach((c: any) => {
      if (c.imageUrl) allUrls.push({ url: c.imageUrl, type: "course" });
    });

    // Attachments
    backupData.attachments.forEach((a: any) => {
      allUrls.push({ url: a.url, type: "attachment" });
    });

    // Chapters
    backupData.chapters.forEach((c: any) => {
      if (c.videoUrl) allUrls.push({ url: c.videoUrl, type: "chapter-video" });
      if (c.documentUrl) allUrls.push({ url: c.documentUrl, type: "chapter-document" });
    });

    // Chapter Attachments
    backupData.chapterAttachments.forEach((a: any) => {
      allUrls.push({ url: a.url, type: "chapter-attachment" });
    });

    // Questions
    backupData.questions.forEach((q: any) => {
      if (q.imageUrl) allUrls.push({ url: q.imageUrl, type: "question" });
    });

    console.log(`📋 Found ${allUrls.length} files to upload`);

    // Upload each file
    for (let i = 0; i < allUrls.length; i++) {
      const { url, type } = allUrls[i];
      try {
        console.log(`[${i + 1}/${allUrls.length}] Uploading: ${url}`);

        // Download file
        const fileName = getFileNameFromUrl(url);
        const tempPath = path.join(tempDir, `${Date.now()}-${fileName}`);

        await downloadFile(url, tempPath);

        // Determine folder based on type
        let folder = getFolderForFileType(fileName);
        if (type === "user") folder = "images";
        if (type === "course") folder = "images";
        if (type === "chapter-video") folder = "videos";
        if (type === "question") folder = "images";

        // Upload to R2
        const key = generateR2Key(fileName, folder);
        const r2Url = await uploadToR2(tempPath, key);

        mapping.push({
          originalUrl: url,
          r2Url,
          r2Key: key,
          fileName,
        });

        // Clean up temp file
        fs.unlinkSync(tempPath);

        console.log(`✅ Uploaded: ${r2Url}`);
      } catch (error: any) {
        console.error(`❌ Failed to upload ${url}:`, error.message);
      }
    }

    // Save mapping
    const mappingFile = path.join(process.cwd(), "uploadthing-to-r2-mapping.json");
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));

    console.log(`\n✅ Upload complete!`);
    console.log(`📝 Mapping saved to: ${mappingFile}`);
    console.log(`📊 Uploaded ${mapping.length} files`);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error: any) {
    console.error("❌ Failed to upload files:", error.message);
    process.exit(1);
  }
}

uploadFilesToR2();

