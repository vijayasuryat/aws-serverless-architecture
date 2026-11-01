# Dropline

Dropline is a serverless note-sharing application that allows users to create a note, receive a six-character pickup code, and retrieve the note from another browser or device without requiring an account.

The application is built using AWS managed services to deliver a lightweight, scalable, and serverless web experience.

## Architecture

![AWS Serverless Architecture](AWS%20Serverless%20Architecture%20Infographic.png)

### AWS Services

- **Amazon S3** — Hosts the frontend application.
- **Amazon CloudFront** — Distributes frontend content.
- **Amazon API Gateway** — Exposes the application API.
- **AWS Lambda** — Handles note creation and retrieval.
- **Amazon DynamoDB** — Stores notes with an expiration policy.
- **Amazon Route 53** — Manages the application domain.
- **AWS Certificate Manager (ACM)** — Provides HTTPS certificates.

## Features

- Create and share notes without an account.
- Generate a unique six-character pickup code.
- Retrieve notes from another browser or device.
- Support for optional display names.
- Automatic expiration of stored notes.

## Application Screenshots

Screenshots of the deployed application and AWS configuration are available in the [`screenshots`](screenshots/) directory.

## Demo

[Watch the application demo](demo-video-link.txt)

## Implementation

The frontend is built using HTML, CSS, and JavaScript.

The backend uses AWS Lambda functions written in Python, with API Gateway handling requests and DynamoDB storing note data.

The application is deployed using AWS serverless services without maintaining dedicated servers.

## Repository Structure

```text
.
├── front-end/
├── lambda-code/
├── screenshots/
├── AWS Serverless Architecture Infographic.png
├── demo-video-link.txt
└── README.md
```

## Project

Built as a hands-on project to implement and deploy a serverless application using AWS cloud services.
