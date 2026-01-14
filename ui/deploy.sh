#!/bin/bash

set -euo pipefail

BUCKET_NAME="richardbraytutor-uptick-cloudfront"
DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"

echo "🏗️  Building React application..."
pnpm build

echo "📦 Uploading files to S3 bucket: $BUCKET_NAME"
aws s3 sync dist/ "s3://$BUCKET_NAME/uptickart/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "*.json"

# Upload HTML files with no-cache
echo "📄 Uploading HTML files..."
aws s3 sync dist/ "s3://$BUCKET_NAME/uptickart/" \
  --delete \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --include "*.json"

if [ -n "$DISTRIBUTION_ID" ]; then
  echo "🔄 Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/uptickart/*"
  echo "✅ Deployment complete! Cache invalidation in progress."
else
  echo "⚠️  CLOUDFRONT_DISTRIBUTION_ID not set. Skipping cache invalidation."
  echo "✅ Deployment complete! (Remember to invalidate CloudFront cache manually)"
fi
