const {
  S3Client,
  CreateBucketCommand,
  ListBucketsCommand,
  DeleteBucketCommand,
  ListObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT, // e.g. https://s3.us-east-1.wasabisys.com
  forcePathStyle: true, // Required for Wasabi
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
  customUserAgent: 'disable-checksums'
});

/*
 * s3.bucket()
 * List all buckets
 */
exports.bucket = async function () {
  return await s3.send(new ListBucketsCommand({}));
};

/*
 * s3.bucket.items()
 * List all objects in a bucket
 */
exports.bucket.items = async function (bucket) {
  return await s3.send(new ListObjectsCommand({ Bucket: bucket }));
};

/*
 * s3.bucket.create()
 * Create a new bucket
 */
exports.bucket.create = async function (name) {
  return await s3.send(new CreateBucketCommand({ Bucket: name }));
};

/*
 * s3.bucket.delete()
 * Delete an empty bucket
 */
exports.bucket.delete = async function (name) {
  return await s3.send(new DeleteBucketCommand({ Bucket: name }));
};

/*
 * s3.upload()
 * Upload file or buffer to S3 (Wasabi)
 */
exports.upload = async function ({ bucket, file, buffer, acl, key }) {
  const content = buffer || fs.readFileSync(file.path);

  const Key = key || file.originalname;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket || process.env.S3_BUCKET,
      Key,
      Body: content,
      ContentType: file.mimetype,
      ...(acl && { ACL: acl }),
    })
  );

  // ✅ Delete file from disk after upload
  if (!buffer && file?.path) {
    fs.unlink(file.path, (err) => {
      if (err) console.error('❌ Failed to delete local file:', err);
      else console.log('✅ Local file deleted:', file.path);
    });
  }

  return `${process.env.S3_ENDPOINT}/${bucket || process.env.S3_BUCKET}/${Key}`;
};

/*
 * s3.delete()
 * Delete a file (or multiple) from a bucket
 */
exports.delete = async function ({ bucket, filename, url }) {
  let objects = [];

  if (filename) {
    objects = Array.isArray(filename)
      ? filename.map((f) => ({ Key: f }))
      : [{ Key: filename }];
  }

  if (url) {
    const key = url.split(`${process.env.S3_BUCKET}/`)[1];
    if (key) objects = [{ Key: key }];
  }

  if (!objects.length) throw new Error('No objects specified for deletion.');

  return await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket || process.env.S3_BUCKET,
      Delete: { Objects: objects },
    })
  );
};

/*
 * s3.signedURL()
 * Generate a signed URL to access a file
 */
exports.signedURLView = async function ({ filename, bucket, expires, acl }) {

  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket || process.env.S3_BUCKET,
      Key: filename
    }),
    { expiresIn: expires || 3600 }
  );
};

/*
 * s3.signedURL()
 * Generate a signed URL to access a file
 */
exports.signedURL = async function ({ filename, bucket, expires, contentType, acl }) {
  if (!filename) throw new Error('Filename is required');

  const command = new PutObjectCommand({
    Bucket: bucket || process.env.S3_BUCKET,
    Key: filename,
    ...(contentType && { ContentType: contentType }),
    // ...(acl && { ACL: acl }),

  });

  const signedUrl = await getSignedUrl(s3, command, {
    expiresIn: expires || 3600,
  });

  return signedUrl;
  
};
