# Dropline

Dropline is a simple serverless note-sharing application that lets you create a note and share it with anyone using a six-character pickup code.

You can create a note, get its code, and open it from another browser or device without needing an account.

The project is built using AWS services to host the frontend, handle API requests, and store notes with an expiration period.

## Architecture


Browser
   |
Route 53
   |
CloudFront
   |---------------------> S3
   |                      Static Frontend
   |
API Gateway
   |
Lambda
   |
DynamoDB


## Features

- Create notes with an optional display name.
- Get a unique six-character pickup code for each note.
- Retrieve notes using their pickup code.
- View the latest notes.
- Notes are configured to expire after seven days.
- Responsive frontend for different screen sizes.
- Browser-based demo mode when an API endpoint is not configured.

## AWS Services

| Service | What it does |
|---|---|
| Route 53 | Routes the application domain to the right destination. |
| CloudFront | Delivers the frontend to users. |
| S3 | Stores the static frontend files. |
| API Gateway | Handles incoming API requests. |
| Lambda | Runs the application logic for creating and retrieving notes. |
| DynamoDB | Stores notes and their expiration details. |

## API

Dropline uses the following API endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/notes` | Creates a note and returns its pickup code. |
| `GET` | `/notes?id={code}` | Retrieves a note using its pickup code. |
| `GET` | `/notes` | Retrieves the latest notes. |

### Create a Note

Send a `POST` request to `/notes` with the note details.

**Request:**

```json
{
  "name": "Anonymous",
  "message": "A note to share"
}
```

**Response:**

```json
{
  "id": "K7QD2M"
}
```

The returned `id` is the pickup code used to access the note later.

### Retrieve a Note

To retrieve a note, send a `GET` request with its pickup code.

**Request:**

```http
GET /notes?id=K7QD2M
```

**Response:**

```json
{
  "id": "K7QD2M",
  "name": "Anonymous",
  "message": "A note to share",
  "createdAt": 1730000000000
}
```

The `createdAt` field contains the time when the note was created, represented as a Unix timestamp in milliseconds.

## Project Structure

```text
dropline/
├── backend/
│   ├── getNotes.py
│   └── saveNote.py
├── app.js
├── config.js
├── index.html
├── styles.css
└── README.md
```

### Files

- `backend/getNotes.py` — Handles retrieving notes and listing the latest notes.
- `backend/saveNote.py` — Handles creating and saving notes.
- `app.js` — Contains the frontend application logic.
- `config.js` — Stores the frontend configuration, including the API endpoint.
- `index.html` — The main HTML file for the application.
- `styles.css` — Contains the styles used by the frontend.

## Configuration

### Frontend

The API endpoint is configured in `config.js`.

Update it with the API Gateway URL of your deployed backend.

### Lambda Environment Variables

The Lambda functions use the following environment variables:

| Variable | Purpose |
|---|---|
| `TABLE_NAME` | Name of the DynamoDB table. |
| `TABLE_REGION` | AWS region where the table is deployed. |
| `ALLOWED_ORIGIN` | Origin allowed to access the API through CORS. |

Make sure the Lambda execution roles have the required permissions to access the DynamoDB table.

## Data Expiration

Each note contains an `expiresAt` attribute that specifies when it should expire.

Notes are configured to expire after seven days. DynamoDB TTL is used to delete expired records automatically, although the actual deletion may take some time.

The backend also checks the expiration timestamp when retrieving a note, so expired notes are not returned even if they still exist in DynamoDB.

## Security

A few things to keep in mind when deploying the application:

- Never commit AWS credentials or access keys to the repository.
- Set `ALLOWED_ORIGIN` to the frontend's actual domain.
- Give each Lambda function only the IAM permissions it needs.
- Restrict DynamoDB access to the required table.
- Configure API Gateway throttling and monitoring before using the application in production.
- Pickup codes provide access to notes, so share them only with the intended recipients.

## License

No license has been added to this project yet.

If you plan to make the project available for others to use, add a `LICENSE` file specifying the terms under which it can be used.
