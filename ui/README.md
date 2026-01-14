# Uptick Art Gallery - React Application

A toy React application showcasing a digital art gallery, built with Vite and deployed to AWS CloudFront.

## Features

- 🎨 Interactive art gallery with 6 sample artworks
- 📱 Responsive design
- ⚡ Fast build and development with Vite
- 🚀 Optimized for CloudFront deployment

## Development

### Prerequisites

- Node.js (v18 or higher)
- pnpm

### Install Dependencies

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev
```

The app will be available at `http://localhost:5173/uptickart/`

### Build for Production

```bash
pnpm build
```

The built files will be in the `dist/` directory, configured to be served from `/uptickart/` path.

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- CloudFront stack deployed (bucket: `richardbraytutor-uptick-cloudfront`)

### Deploy to S3/CloudFront

1. Build the application:
   ```bash
   pnpm build
   ```

2. Deploy using the deployment script:
   ```bash
   pnpm deploy
   ```

   Or manually:
   ```bash
   ./deploy.sh
   ```

3. For automatic cache invalidation, set the CloudFront distribution ID:
   ```bash
   export CLOUDFRONT_DISTRIBUTION_ID=your-distribution-id
   pnpm deploy
   ```

The deployment script will:
- Build the React application
- Sync files to the S3 bucket at `s3://richardbraytutor-uptick-cloudfront/uptickart/`
- Set appropriate cache headers (immutable for assets, no-cache for HTML)
- Optionally invalidate CloudFront cache if `CLOUDFRONT_DISTRIBUTION_ID` is set

## Project Structure

```
ui/
├── src/
│   ├── App.tsx          # Main application component
│   ├── App.css          # Application styles
│   ├── main.tsx         # React entry point
│   └── index.css        # Global styles
├── index.html           # HTML template
├── vite.config.ts       # Vite configuration (base path: /uptickart/)
├── package.json         # Dependencies and scripts
└── deploy.sh            # Deployment script
```

## Configuration

The application is configured to be served from `/uptickart/` path to match the CloudFront distribution settings. This is set in:
- `vite.config.ts` - `base: '/uptickart/'`
- `index.html` - asset paths
