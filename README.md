This is a Next.js frontend for the gait analysis application.

## Getting Started

Set the API endpoint before starting the app.

```bash
NEXT_PUBLIC_API_URL=http://localhost:8100/api/v1
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) in your browser.

## Local Ports

- Frontend: `http://localhost:3100`
- Backend API: `http://localhost:8100/api/v1`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`

## Deployment

When deploying to Vercel or another hosting platform, configure this environment variable:

```bash
NEXT_PUBLIC_API_URL=https://your-backend-domain/api/v1
```
