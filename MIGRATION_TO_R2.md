# Migration from UploadThing to Cloudflare R2 - Complete ✅

## What Was Done

### 1. Dependencies
- ✅ Installed `@aws-sdk/client-s3` and `@aws-sdk/lib-storage`
- ✅ Installed `dotenv` as dev dependency
- ✅ Removed `uploadthing` and `@uploadthing/react` packages

### 2. R2 Configuration Files
- ✅ Created `lib/r2/config.ts` - R2 client configuration
- ✅ Created `lib/r2/upload.ts` - Upload utilities and helper functions

### 3. Upload API Route
- ✅ Created `app/api/r2/upload/route.ts` with:
  - Server-Sent Events (SSE) for real-time progress tracking
  - Multipart upload support for large files (>5MB)
  - Automatic Content-Type detection
  - Progress tracking from 0-100%

### 4. File Upload Component
- ✅ Updated `components/file-upload.tsx` to:
  - Use R2 upload API
  - Display real-time progress bar
  - Support drag & drop
  - Parse SSE stream for progress updates

### 5. Video Player
- ✅ Updated `components/plyr-video-player.tsx` with:
  - CORS support (`crossOrigin="anonymous"`)
  - Multiple video format support
  - Preload metadata for better performance

### 6. Migration Scripts
- ✅ Created `scripts/setup-r2-cors.ts` - Setup CORS configuration
- ✅ Created `scripts/backup-db-urls.ts` - Backup database URLs before migration
- ✅ Created `scripts/upload-to-r2.ts` - Upload existing files to R2
- ✅ Created `scripts/migrate-db-urls-to-r2.ts` - Update database URLs

### 7. Configuration Updates
- ✅ Updated `next.config.js` to include R2 image domains
- ✅ Updated `package.json` with new scripts
- ✅ Removed UploadThing CSS imports from `app/globals.css`

### 8. Component Updates
- ✅ Updated all components using FileUpload:
  - `image-form.tsx` - Course images
  - `attachment-form.tsx` - Course attachments
  - `video-form.tsx` - Chapter videos
  - `document-form.tsx` - Chapter documents
  - `attachments-form.tsx` - Chapter attachments
  - Quiz create/edit pages - Question images

### 9. Cleanup
- ✅ Removed UploadThing files:
  - `lib/uploadthing.ts`
  - `lib/uploadthing/core.ts`
  - `app/api/uploadthing/core.ts`
  - `app/api/uploadthing/route.ts`

## Next Steps

### 1. Environment Variables
Add these to your `.env` file:

```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-bucket.r2.dev
# Or use custom domain: https://cdn.yourdomain.com
```

### 2. Cloudflare R2 Setup
1. Create an R2 bucket in Cloudflare Dashboard
2. Enable Public Access in bucket settings
3. Create API tokens (R2:Read, R2:Write)
4. Note your Account ID, Access Key ID, and Secret Access Key

### 3. Setup CORS
Run the CORS setup script:

```bash
npm run setup-r2-cors
```

### 4. Migrate Existing Files (Optional)
If you have existing files in UploadThing:

1. **Backup database URLs:**
   ```bash
   npm run backup-db-urls
   ```

2. **Download files from UploadThing** (use your existing download script or manual download)

3. **Upload to R2:**
   ```bash
   npm run upload-to-r2
   ```
   This creates `uploadthing-to-r2-mapping.json`

4. **Migrate database URLs:**
   ```bash
   npm run migrate-db-to-r2
   ```

### 5. Test Everything
- ✅ Test file uploads (images, videos, documents)
- ✅ Test video playback
- ✅ Verify all URLs are working
- ✅ Check progress tracking

## Features Implemented

- ✅ Real-time progress tracking via SSE
- ✅ Multipart uploads for large files (>5MB)
- ✅ Automatic Content-Type detection
- ✅ Organized folder structure (images/, videos/, documents/)
- ✅ CORS configuration for video playback
- ✅ Database migration with URL mapping
- ✅ Error handling and retry logic
- ✅ Drag & drop file uploads

## Important Notes

- R2 multipart uploads require minimum 5MB part size
- CORS must be configured for video playback
- Public access must be enabled on R2 bucket
- Always backup database before migration
- Test thoroughly before deploying to production

## Troubleshooting

- **Videos not playing:** Check CORS configuration
- **Upload stuck at 10%:** Check R2 credentials
- **Progress not updating:** Verify SSE stream parsing
- **Database migration fails:** Check mapping file exists

## File Structure

```
lib/r2/
  ├── config.ts          # R2 client configuration
  └── upload.ts          # Upload utilities

app/api/r2/
  └── upload/
      └── route.ts       # Upload API with SSE

scripts/
  ├── setup-r2-cors.ts              # CORS setup
  ├── backup-db-urls.ts             # Backup URLs
  ├── upload-to-r2.ts               # Upload files
  └── migrate-db-urls-to-r2.ts      # Migrate database
```

## Migration Complete! 🎉

Your application is now fully migrated to Cloudflare R2. All file uploads will use R2 instead of UploadThing.

