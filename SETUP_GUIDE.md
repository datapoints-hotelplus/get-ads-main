# Facebook Data to Google Sheets Sync System

This system automatically fetches data from Facebook pages and stores it in a Google Sheet.

## Features

- ✅ Fetch Facebook page data (likes, followers, bio, website)
- ✅ Fetch recent posts and engagement metrics
- ✅ Automatically sync data to Google Sheets
- ✅ Environment variable configuration
- ✅ Web interface for manual sync triggering
- ✅ API endpoint for automated syncing

## Setup Instructions

### 1. Facebook Setup

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create an app or use existing one
3. Get your **Page Access Token**:
   - Go to Tools > Tokens > Token Tool
   - Or use the Graph API Explorer
4. Get your **Page IDs** - you can find these from your page URL or Facebook Graph API

### 2. Google Sheets Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create a Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in the details and create
   - Create a JSON key for the service account
5. Create a Google Sheet:
   - Go to [Google Sheets](https://sheets.google.com)
   - Create a new spreadsheet
   - Share it with the service account email (give edit access)
6. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 3. Environment Variables

Create a `.env.local` file in the project root:

```env
# Facebook API
FB_ACCESS_TOKEN=your_facebook_access_token_here

# Google Sheets
GOOGLE_SHEETS_ID=your_google_sheets_id_here
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

The `GOOGLE_CREDENTIALS_JSON` should be the entire JSON key file contents as a single line string.

### 4. Setup Page IDs in Google Sheets

The system fetches Page IDs from your Google Sheet:

1. In your Google Sheet, create a new sheet named **"PageIDs"**
2. Add a header in cell A1: `Page ID`
3. Add your Facebook Page IDs starting from A2 (one per row):
   ```
   A1: Page ID
   A2: 123456789
   A3: 987654321
   A4: 555555555
   ```
4. Save the sheet

### 5. Running the Sync

#### Via Web Interface

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:3000/sync](http://localhost:3000/sync)
3. Click "Start Sync" button

#### Via API

Make a POST request to the endpoint:

```bash
curl -X POST http://localhost:3000/api/sync-facebook-data
```

#### Via Cron Job (Automated)

Set up a cron job to call the API periodically:

```bash
# Every day at 9 AM
0 9 * * * curl -X POST https://your-domain.com/api/sync-facebook-data
```

## File Structure

```
lib/
  ├── facebook.ts        # Facebook API utilities
  ├── googleSheets.ts    # Google Sheets API utilities
app/
  ├── api/
  │   └── sync-facebook-data/
  │       └── route.ts   # API endpoint
  └── sync/
      └── page.tsx       # Web interface
.env.local               # Configuration (excluded from git)
```

## API Response Format

### Success Response

```json
{
  "success": true,
  "message": "Facebook data successfully synced to Google Sheet",
  "data": {
    "pagesProcessed": 2,
    "rowsInserted": 2,
    "timestamp": "2024-03-20T10:30:00.000Z"
  }
}
```

### Error Response

```json
{
  "error": "Failed to sync Facebook data",
  "details": "Error message here"
}
```

## Troubleshooting

### "Missing required environment variables"

- Ensure all environment variables are set in `.env.local`
- Check for typos in variable names
- Restart the development server after changing `.env.local`
- You only need: `FB_ACCESS_TOKEN` and `GOOGLE_SHEETS_ID` (and `GOOGLE_CREDENTIALS_JSON`)

### "Failed to fetch page IDs from Google Sheet"

- Make sure you have a sheet named "PageIDs" in your Google Sheets
- Check that Page IDs are in column A, starting from row 2
- Ensure the Service Account has access to the spreadsheet
- Verify sheet name is exactly "PageIDs" (case-sensitive)

### "Failed to fetch Facebook page data"

- Verify the Facebook access token is valid
- Check that page IDs in your "PageIDs" sheet are correct Facebook page IDs
- Ensure the token has permission to access the pages

### "Failed to insert data to Google Sheet"

- Verify the Service Account email has edit access to the Sheet
- Check that the Sheet ID is correct
- Ensure GOOGLE_CREDENTIALS_JSON is valid JSON

### "No Facebook data retrieved"

- Check that page IDs in "PageIDs" sheet are valid
- Verify page IDs don't have extra spaces
- Check Facebook API token permissions

## Data Structure in Google Sheet

The system creates columns with:

- **Page ID** - Facebook page ID
- **Page Name** - Page name
- **Likes** - Total page likes
- **Followers** - Total followers
- **Biography** - Page bio
- **Website** - Website URL if set
- **Posts Count** - Number of recent posts fetched
- **Total Likes** - Sum of likes on recent posts
- **Total Comments** - Sum of comments on recent posts
- **Fetched At** - Timestamp of data fetch

## Security Notes

- Never commit `.env.local` to version control
- Keep your Facebook access token and Google credentials secret
- Use environment variables in production, not hardcoded values
- Rotate credentials periodically
- Use short-lived tokens when possible

## Rate Limiting

Facebook API has rate limits. The system fetches:

- Page data for each page ID
- Up to 5 recent posts per page

Consider spacing out sync operations to avoid hitting rate limits.

## Next Steps

1. Customize the data being fetched in `lib/facebook.ts`
2. Add more fields or metrics as needed
3. Set up automated syncing with cron or scheduled functions
4. Add data visualization and analysis to your Google Sheet
